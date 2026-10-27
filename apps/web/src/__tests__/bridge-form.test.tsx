import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BridgeCard } from '../components/bridge-card';
import { Providers } from '../components/providers';
import { useWalletStore } from '../store/wallet-store';

describe('BridgeCard Form States', () => {
  afterEach(() => {
    cleanup();
    useWalletStore.setState({
      publicKey: null,
      jwtToken: null,
      user: null,
    });
  });

  it('renders initial bridge form with network selectors and amount input', () => {
    render(
      <Providers>
        <BridgeCard />
      </Providers>,
    );

    expect(screen.getByText('Cross-Chain Bridge')).toBeDefined();
    expect(screen.getByText('Source Network')).toBeDefined();
    expect(screen.getByText('Destination Network')).toBeDefined();
    expect(screen.getByText('Transfer Amount')).toBeDefined();
  });

  it('allows changing amount and destination recipient', () => {
    render(
      <Providers>
        <BridgeCard />
      </Providers>,
    );

    const amountInput = screen.getByLabelText<HTMLInputElement>('Send');
    fireEvent.change(amountInput, { target: { value: '250' } });
    expect(amountInput.value).toBe('250');

    const recipientInput = screen.getByPlaceholderText<HTMLInputElement>('0x... or Stellar address');
    fireEvent.change(recipientInput, { target: { value: '0x1234567890123456789012345678901234567890' } });
    expect(recipientInput.value).toBe('0x1234567890123456789012345678901234567890');
  });

  it('renders review step button when quote is available', () => {
    render(
      <Providers>
        <BridgeCard />
      </Providers>,
    );

    const reviewButton = screen.getByRole('button', { name: /review transfer/i });
    expect(reviewButton).toBeDefined();
  });
});
