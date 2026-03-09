// Model info cache — periodically refreshes model list from Copilot API
// Used to determine which API path to use (chat/completions, messages, responses)

import { copilotFetch } from "./copilot.ts";

export interface ModelInfo {
  id: string;
  name: string;
  version: string;
  object: string;
  capabilities: {
    family: string;
    type: string;
    limits: {
      max_prompt_tokens?: number;
      max_output_tokens?: number;
    };
    supports: {
      tool_calls?: boolean;
      parallel_tool_calls?: boolean;
      streaming?: boolean;
      vision?: boolean;
      adaptive_thinking?: boolean;
    };
  };
  supported_endpoints?: string[];
}

export interface ModelsResponse {
  object: string;
  data: ModelInfo[];
}

let cachedModels: ModelsResponse | null = null;
let cachedModelsAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Get cached model list, refreshing if stale */
export async function getModels(
  githubToken: string,
  accountType: string,
): Promise<ModelsResponse> {
  const now = Date.now();
  if (cachedModels && now - cachedModelsAt < CACHE_TTL_MS) {
    return cachedModels;
  }

  try {
    const resp = await copilotFetch(
      "/models",
      { method: "GET" },
      githubToken,
      accountType,
    );

    if (resp.ok) {
      cachedModels = (await resp.json()) as ModelsResponse;
      cachedModelsAt = now;
      return cachedModels;
    }
  } catch (e) {
    console.warn("Failed to refresh model cache:", e);
  }

  // Return stale cache if available
  if (cachedModels) return cachedModels;

  // Fallback empty
  return { object: "list", data: [] };
}

/** Find a specific model by ID */
export async function findModel(
  modelId: string,
  githubToken: string,
  accountType: string,
): Promise<ModelInfo | undefined> {
  const models = await getModels(githubToken, accountType);
  return models.data.find((m) => m.id === modelId);
}

/** Check if a model supports a specific endpoint */
export async function modelSupportsEndpoint(
  modelId: string,
  endpoint: string,
  githubToken: string,
  accountType: string,
): Promise<boolean> {
  const model = await findModel(modelId, githubToken, accountType);
  if (!model?.supported_endpoints) return false;
  return model.supported_endpoints.includes(endpoint);
}
