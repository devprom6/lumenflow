/**
 * RouteSource interface — makes the quote engine pluggable.
 *
 * The default implementation uses Horizon path-finding.
 * Future implementations can add Soroban DEX aggregators without
 * changing the quote engine's core logic.
 */

import type { Asset } from '@lumenflow/shared-types';

export interface RouteResult {
  /** Intermediate path assets. */
  path: Asset[];
  /** Amount the sender will pay (for strict-send: equals input; strict-receive: variable). */
  sourceAmount: string;
  /** Amount the receiver will get (for strict-send: variable; strict-receive: equals input). */
  destinationAmount: string;
}

export interface RouteSource {
  /** Human-readable name for logging / selection. */
  readonly name: string;

  /**
   * Find routes for a strict-send swap (send exact, receive best-effort).
   * Returns an empty array if no routes are available.
   */
  findStrictSendRoutes(params: {
    sourceAsset: Asset;
    sourceAmount: string;
    destinationAsset: Asset;
    senderPublicKey?: string | undefined;
  }): Promise<RouteResult[]>;

  /**
   * Find routes for a strict-receive swap (receive exact, pay minimum).
   * Returns an empty array if no routes are available.
   */
  findStrictReceiveRoutes(params: {
    sourceAsset: Asset;
    destinationAsset: Asset;
    destinationAmount: string;
    senderPublicKey?: string | undefined;
  }): Promise<RouteResult[]>;
}
