import type { ArtifactResponse, ConceptGraph, ConceptNode, ProviderConfig } from './types';

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(payload || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function generateTopicGraph(topic: string, provider: ProviderConfig) {
  return postJson<ConceptGraph>('/api/topic-graph', { topic, provider });
}

export function expandNode(topic: string, node: ConceptNode, provider: ProviderConfig) {
  return postJson<ConceptGraph>('/api/expand-node', { topic, node, provider });
}

export function generateArtifact(node: ConceptNode, topic: string, provider: ProviderConfig) {
  return postJson<ArtifactResponse>('/api/generate-artifact', { node, topic, provider });
}
