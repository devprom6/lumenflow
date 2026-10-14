/**
 * HorizonRouteSource — default RouteSource implementation using Stellar Horizon path-finding.
 */

import { findStrictSendPaths, findStrictReceivePaths } from '@lumenflow/stellar';
import type { RouteSource, RouteResult } from './route-source';
import type { Asset } from '@lumenflow/shared-types';

export class HorizonRouteSource implements RouteSource {
  readonly name = 'horizon';

  async findStrictSendRoutes(params: {
    sourceAsset: Asset;
    sourceAmount: string;
    destinationAsset: Asset;
    senderPublicKey?: string | undefined;
  }): Promise<RouteResult[]> {
    try {
      const paths = await findStrictSendPaths({
        sourceAsset: params.sourceAsset,
        sourceAmount: params.sourceAmount,
        destinationAsset: params.destinationAsset,
        sourcePublicKey: params.senderPublicKey,
      });
      return paths.map((p) => ({
        path: p.path,
        sourceAmount: p.sourceAmount,
        destinationAmount: p.destinationAmount,
      }));
    } catch {
      return [];
    }
  }

  async findStrictReceiveRoutes(params: {
    sourceAsset: Asset;
    destinationAsset: Asset;
    destinationAmount: string;
    senderPublicKey?: string | undefined;
  }): Promise<RouteResult[]> {
    try {
      const paths = await findStrictReceivePaths({
        sourceAsset: params.sourceAsset,
        destinationAsset: params.destinationAsset,
        destinationAmount: params.destinationAmount,
        sourcePublicKey: params.senderPublicKey,
      });
      return paths.map((p) => ({
        path: p.path,
        sourceAmount: p.sourceAmount,
        destinationAmount: p.destinationAmount,
      }));
    } catch {
      return [];
    }
  }
}
