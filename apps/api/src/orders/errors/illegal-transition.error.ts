import { BadRequestException } from '@nestjs/common';
import type { OrderStatus } from '@lumenflow/shared-types';

export class IllegalTransitionException extends BadRequestException {
  readonly code = 'ILLEGAL_TRANSITION';
  readonly fromStatus: OrderStatus;
  readonly toStatus: OrderStatus;

  constructor(fromStatus: OrderStatus, toStatus: OrderStatus) {
    super({
      code: 'ILLEGAL_TRANSITION',
      message: `Illegal state transition from '${fromStatus}' to '${toStatus}'.`,
      details: { fromStatus, toStatus },
    });
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}
