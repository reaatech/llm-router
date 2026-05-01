/**
 * Eval Hooks - Hook system for pre/post routing and execution
 */

import type { RoutingDecision, RoutingRequest, RoutingResult } from '@reaatech/llm-router-core';

/** Hook context */
export interface HookContext {
  requestId: string;
  timestamp: number;
  metadata: Record<string, unknown>;
}

/** Pre-routing hook function */
export type PreRoutingHook = (
  request: RoutingRequest,
  context: HookContext,
) => Promise<RoutingRequest>;

/** Post-routing hook function */
export type PostRoutingHook = (
  decision: RoutingDecision,
  request: RoutingRequest,
  context: HookContext,
) => Promise<void>;

/** Post-execution hook function */
export type PostExecutionHook = (
  result: RoutingResult,
  decision: RoutingDecision,
  request: RoutingRequest,
  context: HookContext,
) => Promise<void>;

/** Hook registration */
interface HookRegistration {
  name: string;
  priority: number;
  fn: PreRoutingHook | PostRoutingHook | PostExecutionHook;
}

/**
 * Eval Hooks Manager - Manages pre/post routing and execution hooks
 */
export class EvalHooksManager {
  private preRoutingHooks: HookRegistration[] = [];
  private postRoutingHooks: HookRegistration[] = [];
  private postExecutionHooks: HookRegistration[] = [];

  /** Register a pre-routing hook */
  registerPreRouting(name: string, hook: PreRoutingHook, priority = 10): void {
    this.preRoutingHooks.push({ name, priority, fn: hook });
    this.preRoutingHooks.sort((a, b) => a.priority - b.priority);
  }

  /** Register a post-routing hook */
  registerPostRouting(name: string, hook: PostRoutingHook, priority = 10): void {
    this.postRoutingHooks.push({ name, priority, fn: hook });
    this.postRoutingHooks.sort((a, b) => a.priority - b.priority);
  }

  /** Register a post-execution hook */
  registerPostExecution(name: string, hook: PostExecutionHook, priority = 10): void {
    this.postExecutionHooks.push({ name, priority, fn: hook });
    this.postExecutionHooks.sort((a, b) => a.priority - b.priority);
  }

  /** Execute all pre-routing hooks */
  async executePreRouting(request: RoutingRequest, context: HookContext): Promise<RoutingRequest> {
    let modifiedRequest = { ...request };

    for (const hook of this.preRoutingHooks) {
      modifiedRequest = await (hook.fn as PreRoutingHook)(modifiedRequest, context);
    }

    return modifiedRequest;
  }

  /** Execute all post-routing hooks */
  async executePostRouting(
    decision: RoutingDecision,
    request: RoutingRequest,
    context: HookContext,
  ): Promise<void> {
    for (const hook of this.postRoutingHooks) {
      await (hook.fn as PostRoutingHook)(decision, request, context);
    }
  }

  /** Execute all post-execution hooks */
  async executePostExecution(
    result: RoutingResult,
    decision: RoutingDecision,
    request: RoutingRequest,
    context: HookContext,
  ): Promise<void> {
    for (const hook of this.postExecutionHooks) {
      await (hook.fn as PostExecutionHook)(result, decision, request, context);
    }
  }

  /** Get all registered hook names by type */
  getRegisteredHooks(): {
    preRouting: string[];
    postRouting: string[];
    postExecution: string[];
  } {
    return {
      preRouting: this.preRoutingHooks.map((h) => h.name),
      postRouting: this.postRoutingHooks.map((h) => h.name),
      postExecution: this.postExecutionHooks.map((h) => h.name),
    };
  }

  /** Unregister a hook by name */
  unregister(name: string): boolean {
    let found = false;

    this.preRoutingHooks = this.preRoutingHooks.filter((h) => {
      if (h.name === name) {
        found = true;
        return false;
      }
      return true;
    });

    this.postRoutingHooks = this.postRoutingHooks.filter((h) => {
      if (h.name === name) {
        found = true;
        return false;
      }
      return true;
    });

    this.postExecutionHooks = this.postExecutionHooks.filter((h) => {
      if (h.name === name) {
        found = true;
        return false;
      }
      return true;
    });

    return found;
  }

  /** Clear all hooks */
  clear(): void {
    this.preRoutingHooks = [];
    this.postRoutingHooks = [];
    this.postExecutionHooks = [];
  }
}

/** Default eval hooks manager instance */
export const evalHooksManager = new EvalHooksManager();
