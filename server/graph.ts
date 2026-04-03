type ProviderMode = 'mock' | 'openai-compatible';

export interface ProviderConfig {
  mode: ProviderMode;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  imageModel?: string;
}

export interface ConceptNode {
  id: string;
  title: string;
  summary: string;
  depth: number;
  parentId: string | null;
  relation: string;
  uncertainty: number;
  motif: string;
  learningCue: string;
  suggestedQuestions: string[];
}

export interface ConceptEdge {
  from: string;
  to: string;
  label: string;
}

export interface ConceptGraph {
  topic: string;
  summary: string;
  uncertainty: number;
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  meta: {
    providerMode: ProviderMode;
    usedFallback: boolean;
  };
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function stableHash(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function uncertaintyFor(input: string) {
  return clamp(((stableHash(input) % 38) + 12) / 100, 0.12, 0.72);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractJson(content: string) {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Model response did not contain a JSON object.');
  }
  return JSON.parse(content.slice(start, end + 1));
}

async function callOpenAiCompatible(prompt: string, provider: ProviderConfig) {
  const baseUrl = provider.baseUrl?.replace(/\/$/, '') || 'https://api.openai.com/v1';
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content:
            'You generate JSON-only concept worlds for a first-person knowledge explorer. Never include markdown fences, prose, or commentary outside the JSON object.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ type: string; text?: string }> } }>;
  };

  const rawContent = payload.choices?.[0]?.message?.content;
  const content = Array.isArray(rawContent)
    ? rawContent
        .map((item) => ('text' in item ? item.text ?? '' : ''))
        .join('')
    : rawContent ?? '';

  return extractJson(content);
}

function buildPrompt(topic: string, focusNode?: ConceptNode) {
  return `Create a JSON knowledge world for the topic "${topic}"${
    focusNode ? ` with an expansion focus on the node "${focusNode.title}".` : '.'
  }
Return this shape exactly:
{
  "topic": string,
  "summary": string,
  "uncertainty": number 0-1,
  "nodes": [
    {
      "id": string,
      "title": string,
      "summary": string,
      "depth": number,
      "parentId": string|null,
      "relation": string,
      "uncertainty": number 0-1,
      "motif": string,
      "learningCue": string,
      "suggestedQuestions": string[]
    }
  ],
  "edges": [
    {
      "from": string,
      "to": string,
      "label": string
    }
  ]
}
Constraints:
- Include 1 root node and 6-8 child nodes for a fresh world.
- If a focus node is provided, return that focus node plus 4-6 new child nodes extending it.
- Use concise, highly visual summaries.
- Make uncertainty honest and non-uniform.
- All IDs must be URL-safe slug strings.`;
}

function sanitizeGraph(raw: unknown, providerMode: ProviderMode, usedFallback: boolean, topic: string, focusNode?: ConceptNode): ConceptGraph {
  const data = typeof raw === 'object' && raw ? (raw as Partial<ConceptGraph>) : {};
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const normalizedNodes: ConceptNode[] = nodes
    .map((node, index) => {
      const candidate = node as Partial<ConceptNode>;
      const title = candidate.title?.trim() || `${focusNode?.title || topic} concept ${index + 1}`;
      const id = candidate.id?.trim() || slugify(`${focusNode?.id || topic}-${title}-${index}`);
      return {
        id,
        title,
        summary: candidate.summary?.trim() || `${title} explains how this branch connects to ${topic}.`,
        depth: Number.isFinite(candidate.depth) ? Math.max(0, Number(candidate.depth)) : index === 0 ? 0 : (focusNode?.depth ?? 0) + 1,
        parentId: candidate.parentId === undefined ? (index === 0 ? null : focusNode?.id ?? slugify(topic)) : candidate.parentId,
        relation: candidate.relation?.trim() || (index === 0 ? 'anchor' : 'branch'),
        uncertainty: clamp(Number(candidate.uncertainty ?? uncertaintyFor(id))),
        motif: candidate.motif?.trim() || 'glowing archive geometry',
        learningCue: candidate.learningCue?.trim() || `Approach ${title} to unlock a more tactile explanation.`,
        suggestedQuestions: Array.isArray(candidate.suggestedQuestions)
          ? candidate.suggestedQuestions.slice(0, 4).map((question) => String(question))
          : [`Why does ${title} matter?`, `Show a simple example of ${title}.`],
      };
    })
    .filter((node) => node.title.length > 0);

  const rootId = focusNode?.id ?? normalizedNodes[0]?.id ?? slugify(topic);
  const edges = Array.isArray(data.edges)
    ? data.edges
        .map((edge) => {
          const candidate = edge as Partial<ConceptEdge>;
          return {
            from: candidate.from?.trim() || rootId,
            to: candidate.to?.trim() || rootId,
            label: candidate.label?.trim() || 'connects',
          };
        })
        .filter((edge) => edge.from !== edge.to)
    : [];

  return {
    topic: data.topic?.trim() || topic,
    summary:
      data.summary?.trim() ||
      `A model-generated conceptual world for ${topic}, tuned for first-person exploration and branching explanation.`,
    uncertainty: clamp(Number(data.uncertainty ?? uncertaintyFor(topic))),
    nodes: normalizedNodes,
    edges,
    meta: {
      providerMode,
      usedFallback,
    },
  };
}

function buildFallbackGraph(topic: string, focusNode?: ConceptNode): ConceptGraph {
  if (focusNode) {
    const titles = ['Mechanics', 'Analogy', 'Common pitfall', 'Applied pattern', 'Advanced edge'];
    const nodes: ConceptNode[] = [focusNode, ...titles.map((label, index) => ({
      id: slugify(`${focusNode.id}-${label}`),
      title: `${focusNode.title}: ${label}`,
      summary: `This branch deepens ${focusNode.title} through ${label.toLowerCase()} so the player can traverse the concept from another angle.`,
      depth: focusNode.depth + 1,
      parentId: focusNode.id,
      relation: index === 0 ? 'mechanism' : index === 1 ? 'analogy' : index === 2 ? 'misconception' : index === 3 ? 'application' : 'advanced',
      uncertainty: uncertaintyFor(`${focusNode.id}-${label}`),
      motif: index % 2 === 0 ? 'crystalline glyphs' : 'liquid neon geometry',
      learningCue: `Stand near this branch to unpack ${focusNode.title} via ${label.toLowerCase()}.`,
      suggestedQuestions: [
        `Simplify ${focusNode.title} through ${label.toLowerCase()}.`,
        `What is the main intuition behind ${focusNode.title}?`,
      ],
    }))];

    return {
      topic,
      summary: `Expanded the ${focusNode.title} branch into a deeper LLM-native learning chamber.`,
      uncertainty: clamp((focusNode.uncertainty + 0.08) / 1.05),
      nodes,
      edges: nodes.slice(1).map((node) => ({ from: focusNode.id, to: node.id, label: node.relation })),
      meta: {
        providerMode: 'mock',
        usedFallback: true,
      },
    };
  }

  const rootId = slugify(topic);
  const branches = [
    ['Foundations', 'prerequisite'],
    ['Core mechanics', 'mechanism'],
    ['Examples', 'example'],
    ['Analogies', 'analogy'],
    ['Misconceptions', 'misconception'],
    ['Applications', 'application'],
    ['Advanced frontier', 'advanced'],
  ] as const;

  const root: ConceptNode = {
    id: rootId,
    title: topic,
    summary: `The central atrium of ${topic}, generated directly from the model's internal conceptual decomposition.`,
    depth: 0,
    parentId: null,
    relation: 'anchor',
    uncertainty: uncertaintyFor(topic) * 0.7,
    motif: 'luminous threshold',
    learningCue: `Start here to orient yourself before branching into ${topic}.`,
    suggestedQuestions: [
      `What are the essential pieces of ${topic}?`,
      `What should I understand first about ${topic}?`,
    ],
  };

  const children = branches.map(([label, relation], index) => ({
    id: slugify(`${topic}-${label}`),
    title: label,
    summary: `${label} reframes ${topic} through a distinct explanatory lens so the player can navigate by intuition, not by chat history.`,
    depth: 1,
    parentId: rootId,
    relation,
    uncertainty: uncertaintyFor(`${topic}-${label}`),
    motif: index % 2 === 0 ? 'floating glass monoliths' : 'holographic calligraphy',
    learningCue: `Approach this chamber to explore ${topic} through ${label.toLowerCase()}.`,
    suggestedQuestions: [
      `Give me a simple explanation of ${label.toLowerCase()} for ${topic}.`,
      `How does ${label.toLowerCase()} change my understanding of ${topic}?`,
    ],
  }));

  return {
    topic,
    summary: `A first-pass concept world for ${topic}, with branches covering structure, examples, analogies, and uncertainty.`,
    uncertainty: clamp((root.uncertainty + children.reduce((sum, node) => sum + node.uncertainty, 0) / children.length) / 2),
    nodes: [root, ...children],
    edges: children.map((node) => ({ from: rootId, to: node.id, label: node.relation })),
    meta: {
      providerMode: 'mock',
      usedFallback: true,
    },
  };
}

export async function generateGraph(topic: string, provider: ProviderConfig, focusNode?: ConceptNode) {
  if (provider.mode === 'openai-compatible' && provider.apiKey && provider.model) {
    try {
      const raw = await callOpenAiCompatible(buildPrompt(topic, focusNode), provider);
      return sanitizeGraph(raw, 'openai-compatible', false, topic, focusNode);
    } catch {
      return buildFallbackGraph(topic, focusNode);
    }
  }

  return buildFallbackGraph(topic, focusNode);
}

export async function generateArtifact(node: ConceptNode, topic: string, provider: ProviderConfig) {
  let prompt = `${node.title} as ${node.motif}, emphasizing ${node.relation} and the emotional tone of a futuristic memory palace.`;

  if (provider.mode === 'openai-compatible' && provider.apiKey && provider.model) {
    try {
      const raw = await callOpenAiCompatible(
        `Return JSON only with the shape {"prompt": string}. Create a vivid visual prompt for a concept artifact representing "${node.title}" within the topic "${topic}". Use under 35 words.`,
        provider,
      );
      if (typeof raw?.prompt === 'string' && raw.prompt.trim()) {
        prompt = raw.prompt.trim();
      }
    } catch {
      // Fallback to deterministic SVG prompt.
    }
  }

  const palette = node.uncertainty > 0.55
    ? ['#3a103f', '#ff6bd7', '#ffd0f6']
    : ['#041a2d', '#6cecff', '#dff9ff'];

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="768" height="512" viewBox="0 0 768 512">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${palette[0]}" />
          <stop offset="55%" stop-color="${palette[1]}" />
          <stop offset="100%" stop-color="#050816" />
        </linearGradient>
        <radialGradient id="orb" cx="50%" cy="38%" r="45%">
          <stop offset="0%" stop-color="${palette[2]}" stop-opacity="0.98" />
          <stop offset="100%" stop-color="${palette[1]}" stop-opacity="0.12" />
        </radialGradient>
      </defs>
      <rect width="768" height="512" fill="url(#bg)" rx="28" />
      <circle cx="384" cy="220" r="142" fill="url(#orb)" />
      <path d="M132 408 C 216 300, 288 272, 384 214 S 552 156, 640 98" stroke="${palette[2]}" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.72" />
      <path d="M188 144 L 384 84 L 572 144 L 384 310 Z" fill="none" stroke="${palette[2]}" stroke-width="4" opacity="0.38" />
      <text x="64" y="392" fill="#f4fbff" font-size="42" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeXml(node.title)}</text>
      <text x="64" y="432" fill="#d3ecff" font-size="22" font-family="Arial, Helvetica, sans-serif">${escapeXml(prompt.slice(0, 78))}</text>
      <text x="64" y="468" fill="#a5d8ff" font-size="18" font-family="Arial, Helvetica, sans-serif">${escapeXml(node.learningCue)}</text>
    </svg>
  `;

  return {
    nodeId: node.id,
    prompt,
    imageUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  };
}

function escapeXml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
