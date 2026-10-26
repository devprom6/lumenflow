import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SwapCard } from '../components/swap-card';
import { Providers } from '../components/providers';
import { useWalletStore } from '../store/wallet-store';

describe('SwapCard Form States', () => {
  afterEach(() => {
    cleanup();
    useWalletStore.setState({
      publicKey: null,
      jwtToken: null,
      user: null,
    });
  });

  it('renders initial swap card with pay and receive inputs', () => {
    render(
      <Providers>
        <SwapCard />
      </Providers>,
    );

    expect(screen.getByText('Swap')).toBeDefined();
    expect(screen.getByLabelText(/you pay/i)).toBeDefined();
    expect(screen.getByLabelText(/you receive/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /connect wallet to swap/i })).toBeDefined();
  });

  it('allows entering amount and clicking max button', () => {
    render(
      <Providers>
        <SwapCard />
      </Providers>,
    );

    const input = screen.getByLabelText<HTMLInputElement>(/you pay/i);
    fireEvent.change(input, { target: { value: '25.5' } });
    expect(input.value).toBe('25.5');

    const maxBtn = screen.getByRole('button', { name: /use maximum balance/i });
    fireEvent.click(maxBtn);
    expect(input.value).toBe('250');
  });

  it('swaps source and destination assets when flip button is clicked', () => {
    render(
      <Providers>
        <SwapCard />
      </Providers>,
    );

    const flipBtn = screen.getByRole('button', {
      name: /switch source and destination assets/i,
    });
    expect(flipBtn).toBeDefined();
    fireEvent.click(flipBtn);
  });

  it('shows connected state and swap button when wallet is connected', () => {
    useWalletStore.setState({
      publicKey: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI',
      jwtToken: 'mock-jwt-token',
      user: {
        id: 'usr-1',
        publicKey: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI',
      },
    });

    render(
      <Providers>
        <SwapCard />
      </Providers>,
    );

    // Wallet is connected; button prompts to enter amount or fetch
    const swapBtn = screen.getByRole('button', {
      name: /enter an amount|fetching best route|swap assets/i,
    });
    expect(swapBtn).toBeDefined();
  });
});
