import { useCallback, useEffect, useMemo, useState } from 'react';
import { VeraScene } from './components/VeraScene';
import { expandNode, generateArtifact, generateTopicGraph } from './lib/api';
import { layoutGraph } from './lib/layout';
import type { ConceptEdge, ConceptGraph, ConceptNode, ProviderConfig } from './lib/types';
import './styles/app.css';

const DEFAULT_TOPIC = 'Transformers in machine learning';
const PROVIDER_STORAGE_KEY = 'vera-provider-config';

function loadProvider(): ProviderConfig {
  const stored = localStorage.getItem(PROVIDER_STORAGE_KEY);
  if (!stored) {
    return {
      mode: 'mock',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
      imageModel: 'concept-art-svg',
    };
  }

  try {
    return JSON.parse(stored) as ProviderConfig;
  } catch {
    return {
      mode: 'mock',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
      imageModel: 'concept-art-svg',
    };
  }
}

function mergeGraphs(base: ConceptGraph | null, addition: ConceptGraph): ConceptGraph {
  if (!base) {
    return addition;
  }

  const nodeMap = new Map(base.nodes.map((node) => [node.id, node]));
  addition.nodes.forEach((node) => nodeMap.set(node.id, node));

  const edgeMap = new Map<string, ConceptEdge>();
  [...base.edges, ...addition.edges].forEach((edge) => {
    edgeMap.set(`${edge.from}->${edge.to}:${edge.label}`, edge);
  });

  return {
    ...base,
    topic: addition.topic || base.topic,
    summary: addition.summary || base.summary,
    uncertainty: addition.uncertainty,
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
    meta: addition.meta,
  };
}

export default function App() {
  const [provider, setProvider] = useState<ProviderConfig>(() => loadProvider());
  const [topic, setTopic] = useState(DEFAULT_TOPIC);
  const [graph, setGraph] = useState<ConceptGraph | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [artifactUrls, setArtifactUrls] = useState<Record<string, string>>({});
  const [loadingMessage, setLoadingMessage] = useState('Generating world...');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(provider));
  }, [provider]);

  const layoutNodes = useMemo(() => (graph ? layoutGraph(graph) : []), [graph]);
  const selectedNode = useMemo(
    () => graph?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [graph, selectedNodeId],
  );
  const activeNode = useMemo(
    () => graph?.nodes.find((node) => node.id === activeNodeId) ?? null,
    [graph, activeNodeId],
  );

  const handleGenerate = useCallback(async () => {
    setIsBusy(true);
    setLoadingMessage('Generating world...');
    setError(null);
    try {
      const response = await generateTopicGraph(topic, provider);
      setGraph(response);
      setSelectedNodeId(response.nodes[0]?.id ?? null);
      setArtifactUrls({});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to generate the Vera world.');
    } finally {
      setIsBusy(false);
    }
  }, [provider, topic]);

  useEffect(() => {
    void handleGenerate();
  }, []);

  const handleExpand = useCallback(async () => {
    if (!selectedNode || !graph) {
      return;
    }

    setIsBusy(true);
    setLoadingMessage(`Expanding ${selectedNode.title}...`);
    setError(null);
    try {
      const response = await expandNode(graph.topic, selectedNode, provider);
      setGraph((current) => mergeGraphs(current, response));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to expand the selected concept.');
    } finally {
      setIsBusy(false);
    }
  }, [graph, provider, selectedNode]);

  const handleArtifact = useCallback(async () => {
    if (!selectedNode || !graph) {
      return;
    }

    setIsBusy(true);
    setLoadingMessage(`Rendering artifact for ${selectedNode.title}...`);
    setError(null);
    try {
      const response = await generateArtifact(selectedNode, graph.topic, provider);
      setArtifactUrls((current) => ({ ...current, [response.nodeId]: response.imageUrl }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to generate the concept artifact.');
    } finally {
      setIsBusy(false);
    }
  }, [graph, provider, selectedNode]);

  return (
    <div className="app-shell">
      <div className="scene-shell">
        <VeraScene
          nodes={layoutNodes}
          activeNodeId={activeNodeId}
          selectedNodeId={selectedNodeId}
          artifactUrls={artifactUrls}
          onActiveNodeChange={setActiveNodeId}
          onInspectNode={setSelectedNodeId}
        />
      </div>

      <header className="top-bar glass-panel">
        <div>
          <p className="eyebrow">Vera</p>
          <h1>First-person LLM knowledge explorer</h1>
        </div>
        <div className="status-cluster">
          <span className={`status-pill ${graph?.meta.usedFallback ? 'status-pill--warning' : ''}`}>
            {graph?.meta.usedFallback ? 'Fallback graph' : `Provider: ${graph?.meta.providerMode ?? provider.mode}`}
          </span>
          <span className="status-pill">WASD move · Mouse look · E inspect · Esc unlock</span>
        </div>
      </header>

      <aside className="left-panel glass-panel">
        <section>
          <p className="eyebrow">World seed</p>
          <label className="field-label">
            Topic
            <textarea value={topic} onChange={(event) => setTopic(event.target.value)} rows={3} />
          </label>
          <button className="primary-button" onClick={() => void handleGenerate()} disabled={isBusy}>
            {isBusy ? loadingMessage : 'Generate knowledge world'}
          </button>
        </section>

        <section>
          <p className="eyebrow">Provider connection</p>
          <label className="field-label">
            Mode
            <select
              value={provider.mode}
              onChange={(event) =>
                setProvider((current) => ({
                  ...current,
                  mode: event.target.value as ProviderConfig['mode'],
                }))
              }
            >
              <option value="mock">Mock (offline MVP)</option>
              <option value="openai-compatible">OpenAI-compatible endpoint</option>
            </select>
          </label>
          <label className="field-label">
            Base URL
            <input
              value={provider.baseUrl ?? ''}
              onChange={(event) => setProvider((current) => ({ ...current, baseUrl: event.target.value }))}
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <label className="field-label">
            Model
            <input
              value={provider.model ?? ''}
              onChange={(event) => setProvider((current) => ({ ...current, model: event.target.value }))}
              placeholder="gpt-4.1-mini"
            />
          </label>
          <label className="field-label">
            API key
            <input
              type="password"
              value={provider.apiKey ?? ''}
              onChange={(event) => setProvider((current) => ({ ...current, apiKey: event.target.value }))}
              placeholder="sk-..."
            />
          </label>
        </section>

        <section>
          <p className="eyebrow">World state</p>
          <div className="summary-card">
            <strong>{graph?.topic ?? 'Loading world...'}</strong>
            <p>{graph?.summary ?? 'Vera is asking the model to scaffold a conceptual world.'}</p>
            <div className="metric-row">
              <span>{graph?.nodes.length ?? 0} nodes</span>
              <span>{graph ? `${Math.round((1 - graph.uncertainty) * 100)}% clarity` : '—'}</span>
            </div>
          </div>
          {error ? <p className="error-banner">{error}</p> : null}
        </section>
      </aside>

      <aside className="right-panel glass-panel">
        <section>
          <p className="eyebrow">Nearest concept</p>
          <div className="summary-card compact">
            <strong>{activeNode?.title ?? 'Move closer to a concept node'}</strong>
            <p>{activeNode?.learningCue ?? 'Walk toward a concept crystal to focus it.'}</p>
          </div>
        </section>

        <section>
          <p className="eyebrow">Inspection</p>
          <div className="summary-card detail-card">
            <strong>{selectedNode?.title ?? 'No concept selected'}</strong>
            <p>{selectedNode?.summary ?? 'Press E near a concept or click Generate knowledge world to start a new run.'}</p>
            {selectedNode ? (
              <>
                <div className="metric-row">
                  <span>Relation: {selectedNode.relation}</span>
                  <span>Depth: {selectedNode.depth}</span>
                </div>
                <div className="metric-row">
                  <span>Motif: {selectedNode.motif}</span>
                  <span>Uncertainty: {Math.round(selectedNode.uncertainty * 100)}%</span>
                </div>
                <div className="question-list">
                  {selectedNode.suggestedQuestions.map((question) => (
                    <span key={question}>{question}</span>
                  ))}
                </div>
              </>
            ) : null}
          </div>
          <div className="action-row">
            <button onClick={() => activeNodeId && setSelectedNodeId(activeNodeId)} disabled={!activeNodeId}>
              Focus nearest
            </button>
            <button onClick={() => void handleExpand()} disabled={!selectedNode || isBusy}>
              Expand branch
            </button>
            <button onClick={() => void handleArtifact()} disabled={!selectedNode || isBusy}>
              Render artifact
            </button>
          </div>
        </section>

        <section>
          <p className="eyebrow">Artifact viewport</p>
          <div className="artifact-panel">
            {selectedNode && artifactUrls[selectedNode.id] ? (
              <img src={artifactUrls[selectedNode.id]} alt={`${selectedNode.title} artifact`} />
            ) : (
              <div className="artifact-placeholder">
                <strong>No artifact rendered yet</strong>
                <p>Generate a visual panel for the selected concept.</p>
              </div>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
