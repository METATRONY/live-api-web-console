import {
  ChangeEvent,
  FormEventHandler,
  useCallback,
  useMemo,
  useState,
} from "react";
import "./settings-dialog.scss";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import VoiceSelector from "./VoiceSelector";
import ResponseModalitySelector from "./ResponseModalitySelector";
import { FunctionDeclaration, LiveConnectConfig, Tool } from "@google/genai";

/** Delimiter used to store RAG context inside systemInstruction so we can edit prompt and RAG separately */
const RAG_DELIMITER = "\n\n---RAG CONTEXT---\n\n";

function parsePromptAndRag(systemInstruction: string | undefined): {
  prompt: string;
  rag: string;
} {
  if (!systemInstruction) return { prompt: "", rag: "" };
  const idx = systemInstruction.indexOf(RAG_DELIMITER);
  if (idx === -1) return { prompt: systemInstruction.trim(), rag: "" };
  return {
    prompt: systemInstruction.slice(0, idx).trim(),
    rag: systemInstruction.slice(idx + RAG_DELIMITER.length).trim(),
  };
}

function mergePromptAndRag(prompt: string, rag: string): string {
  if (!rag) return prompt;
  return prompt + RAG_DELIMITER + rag;
}

type FunctionDeclarationsTool = Tool & {
  functionDeclarations: FunctionDeclaration[];
};

export default function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const { config, setConfig, connected } = useLiveAPIContext();
  const functionDeclarations: FunctionDeclaration[] = useMemo(() => {
    if (!Array.isArray(config.tools)) {
      return [];
    }
    return (config.tools as Tool[])
      .filter((t: Tool): t is FunctionDeclarationsTool =>
        Array.isArray((t as any).functionDeclarations)
      )
      .map((t) => t.functionDeclarations)
      .filter((fc) => !!fc)
      .flat();
  }, [config]);

  // Normalize system instruction to a single string for prompt + RAG editing
  const systemInstructionRaw = useMemo(() => {
    if (!config.systemInstruction) return "";
    if (typeof config.systemInstruction === "string")
      return config.systemInstruction;
    if (Array.isArray(config.systemInstruction))
      return config.systemInstruction
        .map((p) => (typeof p === "string" ? p : p.text))
        .join("\n");
    if (
      typeof config.systemInstruction === "object" &&
      "parts" in config.systemInstruction
    )
      return (
        config.systemInstruction.parts?.map((p) => p.text).join("\n") || ""
      );
    return "";
  }, [config]);

  const { prompt, rag } = useMemo(
    () => parsePromptAndRag(systemInstructionRaw),
    [systemInstructionRaw]
  );

  const updatePrompt: FormEventHandler<HTMLTextAreaElement> = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setConfig({
        ...config,
        systemInstruction: mergePromptAndRag(event.target.value, rag),
      });
    },
    [config, setConfig, rag]
  );

  const updateRag: FormEventHandler<HTMLTextAreaElement> = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setConfig({
        ...config,
        systemInstruction: mergePromptAndRag(prompt, event.target.value),
      });
    },
    [config, setConfig, prompt]
  );

  const loadRagFromFile = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === "string" ? reader.result : "";
        setConfig({
          ...config,
          systemInstruction: mergePromptAndRag(prompt, text),
        });
      };
      reader.readAsText(file);
      event.target.value = "";
    },
    [config, setConfig, prompt]
  );

  const updateFunctionDescription = useCallback(
    (editedFdName: string, newDescription: string) => {
      const newConfig: LiveConnectConfig = {
        ...config,
        tools:
          config.tools?.map((tool) => {
            const fdTool = tool as FunctionDeclarationsTool;
            if (!Array.isArray(fdTool.functionDeclarations)) {
              return tool;
            }
            return {
              ...tool,
              functionDeclarations: fdTool.functionDeclarations.map((fd) =>
                fd.name === editedFdName
                  ? { ...fd, description: newDescription }
                  : fd
              ),
            };
          }) || [],
      };
      setConfig(newConfig);
    },
    [config, setConfig]
  );

  return (
    <div className="settings-dialog">
      <button
        className="action-button material-symbols-outlined"
        onClick={() => setOpen(!open)}
      >
        settings
      </button>
      <dialog className="dialog" style={{ display: open ? "block" : "none" }}>
        <div className={`dialog-container ${connected ? "disabled" : ""}`}>
          {connected && (
            <div className="connected-indicator">
              <p>
                These settings can only be applied before connecting and will
                override other settings.
              </p>
            </div>
          )}
          <div className="mode-selectors">
            <ResponseModalitySelector />
            <VoiceSelector />
          </div>

          <h3>Prompt</h3>
          <p className="small">System instruction for the model (e.g. role, tone, rules).</p>
          <textarea
            className="system"
            onChange={updatePrompt}
            value={prompt}
            placeholder="You are a helpful assistant..."
          />
          <h3>RAG / Knowledge context</h3>
          <p className="small">Optional. Paste text, or load a .txt file. The model will use this context when answering.</p>
          <div className="rag-file-row">
            <label className="rag-file-label">
              <input
                type="file"
                accept=".txt,text/plain"
                onChange={loadRagFromFile}
                className="rag-file-input"
              />
              <span className="rag-file-button">Load .txt file</span>
            </label>
          </div>
          <textarea
            className="system rag"
            onChange={updateRag}
            value={rag}
            placeholder="Paste or type reference content, or load a text file above..."
          />
          <h4>Function declarations</h4>
          <div className="function-declarations">
            <div className="fd-rows">
              {functionDeclarations.map((fd, fdKey) => (
                <div className="fd-row" key={`function-${fdKey}`}>
                  <span className="fd-row-name">{fd.name}</span>
                  <span className="fd-row-args">
                    {Object.keys(fd.parameters?.properties || {}).map(
                      (item, k) => (
                        <span key={k}>{item}</span>
                      )
                    )}
                  </span>
                  <input
                    key={`fd-${fd.description}`}
                    className="fd-row-description"
                    type="text"
                    defaultValue={fd.description}
                    onBlur={(e) =>
                      updateFunctionDescription(fd.name!, e.target.value)
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
}
