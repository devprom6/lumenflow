import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Button } from '../components/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/card';
import { StatusBadge } from '../components/status-badge';
import { AmountInput } from '../components/amount-input';
import { AssetPicker, AssetOption } from '../components/asset-picker';
import { Stepper, StepItem } from '../components/stepper';
import { Toast } from '../components/toast';
import { EmptyState } from '../components/empty-state';
import { ErrorState } from '../components/error-state';

describe('UI Component Library', () => {
  afterEach(() => {
    cleanup();
  });

  describe('Button', () => {
    it('renders with children and responds to click', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Swap Now</Button>);

      const button = screen.getByRole('button', { name: /swap now/i });
      expect(button).toBeDefined();
      fireEvent.click(button);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('renders loading state with disabled attribute and aria-busy', () => {
      render(<Button isLoading>Submitting</Button>);
      const button = screen.getByRole('button', { name: /submitting/i });
      expect(button.getAttribute('disabled')).not.toBeNull();
      expect(button.getAttribute('aria-busy')).toBe('true');
    });

    it('applies destructive variant classes', () => {
      render(<Button variant="destructive">Delete</Button>);
      const button = screen.getByRole('button', { name: /delete/i });
      expect(button.className).toContain('bg-red-600');
    });
  });

  describe('Card', () => {
    it('renders complete card structure with header, content, and footer', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Swap Stellar Assets</CardTitle>
            <CardDescription>Instant non-custodial swaps</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Card body content</p>
          </CardContent>
          <CardFooter>
            <Button>Confirm</Button>
          </CardFooter>
        </Card>,
      );

      expect(screen.getByText('Swap Stellar Assets')).toBeDefined();
      expect(screen.getByText('Instant non-custodial swaps')).toBeDefined();
      expect(screen.getByText('Card body content')).toBeDefined();
      expect(screen.getByRole('button', { name: /confirm/i })).toBeDefined();
    });
  });

  describe('StatusBadge', () => {
    it('renders semantic labels and styles for various order statuses', () => {
      const { rerender } = render(<StatusBadge status="COMPLETED" />);
      expect(screen.getByText('Completed')).toBeDefined();
      expect(screen.getByRole('status').className).toContain('bg-emerald-50');

      rerender(<StatusBadge status="AWAITING_SIGNATURE" />);
      expect(screen.getByText('Awaiting Signature')).toBeDefined();

      rerender(<StatusBadge status="FAILED" />);
      expect(screen.getByText('Failed')).toBeDefined();
      expect(screen.getByRole('status').className).toContain('bg-rose-50');
    });
  });

  describe('AmountInput', () => {
    it('renders input with balance and triggers max click', () => {
      const handleChange = vi.fn();
      const handleMax = vi.fn();

      render(
        <AmountInput
          value="50.00"
          onChange={handleChange}
          assetSymbol="XLM"
          balance="100.00"
          onMaxClick={handleMax}
        />,
      );

      expect(screen.getByDisplayValue('50.00')).toBeDefined();
      expect(screen.getByText('Balance: 100.00')).toBeDefined();

      const maxBtn = screen.getByRole('button', { name: /use maximum balance/i });
      fireEvent.click(maxBtn);
      expect(handleMax).toHaveBeenCalledTimes(1);
    });

    it('renders validation error message when provided', () => {
      render(
        <AmountInput
          value=""
          onChange={vi.fn()}
          error="Insufficient XLM balance"
        />,
      );

      expect(screen.getByRole('alert').textContent).toContain('Insufficient XLM balance');
    });
  });

  describe('AssetPicker', () => {
    const nativeXlm = { type: 'native' as const, code: 'XLM' as const };
    const creditUsdc = {
      type: 'credit_alphanum4' as const,
      code: 'USDC',
      issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    };

    const assets: AssetOption[] = [
      {
        asset: nativeXlm,
        name: 'Stellar Lumens',
        symbol: 'XLM',
        balance: '500.00',
      },
      {
        asset: creditUsdc,
        name: 'USD Coin',
        symbol: 'USDC',
        balance: '125.50',
      },
    ];

    it('renders current asset and opens selector dropdown on click', () => {
      const handleSelect = vi.fn();
      render(
        <AssetPicker
          selectedAsset={nativeXlm}
          availableAssets={assets}
          onSelect={handleSelect}
        />,
      );

      const trigger = screen.getByRole('button', { name: /xlm stellar lumens/i });
      expect(trigger).toBeDefined();

      fireEvent.click(trigger);
      expect(screen.getByRole('listbox')).toBeDefined();

      // Click on USDC option
      const usdcOption = screen.getByRole('option', { name: /usdc/i });
      fireEvent.click(usdcOption);

      expect(handleSelect).toHaveBeenCalledWith(creditUsdc);
    });
  });

  describe('Stepper', () => {
    const steps: StepItem[] = [
      { id: '1', label: 'Quote', state: 'completed' },
      { id: '2', label: 'Sign', state: 'current' },
      { id: '3', label: 'Submit', state: 'upcoming' },
    ];

    it('renders progress steps with appropriate states', () => {
      render(<Stepper steps={steps} />);

      expect(screen.getByText('Quote')).toBeDefined();
      expect(screen.getByText('Sign')).toBeDefined();
      expect(screen.getByText('Submit')).toBeDefined();

      const currentStep = screen.getByRole('listitem', { current: 'step' });
      expect(currentStep).toBeDefined();
      expect(currentStep.textContent).toContain('Sign');
    });
  });

  describe('Toast', () => {
    it('renders notification message and responds to dismiss', () => {
      const handleDismiss = vi.fn();
      render(
        <Toast
          id="toast-1"
          title="Swap Submitted"
          description="Transaction sent to Stellar network"
          variant="success"
          onDismiss={handleDismiss}
        />,
      );

      expect(screen.getByText('Swap Submitted')).toBeDefined();
      expect(screen.getByText('Transaction sent to Stellar network')).toBeDefined();

      const closeBtn = screen.getByRole('button', { name: /close notification/i });
      fireEvent.click(closeBtn);
      expect(handleDismiss).toHaveBeenCalledWith('toast-1');
    });
  });

  describe('EmptyState', () => {
    it('renders empty message and optional action button', () => {
      const handleAction = vi.fn();
      render(
        <EmptyState
          title="No Transactions"
          description="You haven't made any swaps yet"
          actionLabel="Start Swapping"
          onAction={handleAction}
        />,
      );

      expect(screen.getByText('No Transactions')).toBeDefined();
      expect(screen.getByText("You haven't made any swaps yet")).toBeDefined();

      const btn = screen.getByRole('button', { name: /start swapping/i });
      fireEvent.click(btn);
      expect(handleAction).toHaveBeenCalledTimes(1);
    });
  });

  describe('ErrorState', () => {
    it('renders error message and retry button', () => {
      const handleRetry = vi.fn();
      render(
        <ErrorState
          title="Network Error"
          message="Failed to connect to Stellar Horizon"
          details="Timeout: 504 Gateway"
          onRetry={handleRetry}
        />,
      );

      expect(screen.getByText('Network Error')).toBeDefined();
      expect(screen.getByText('Failed to connect to Stellar Horizon')).toBeDefined();

      const retryBtn = screen.getByRole('button', { name: /try again/i });
      fireEvent.click(retryBtn);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });
  });
});
