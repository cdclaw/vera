export type ProviderMode = 'mock' | 'openai-compatible';

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

export interface ArtifactResponse {
  nodeId: string;
  imageUrl: string;
  prompt: string;
}

export interface LayoutNode extends ConceptNode {
  position: [number, number, number];
}
