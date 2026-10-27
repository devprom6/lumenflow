import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { OfframpCard } from '../components/offramp-card';
import { Providers } from '../components/providers';
import { useWalletStore } from '../store/wallet-store';

describe('OfframpCard Form States', () => {
  afterEach(() => {
    cleanup();
    useWalletStore.setState({
      publicKey: null,
      jwtToken: null,
      user: null,
    });
  });

  it('renders initial offramp form with currency options and amount input', () => {
    render(
      <Providers>
        <OfframpCard />
      </Providers>,
    );

    expect(screen.getByText('Crypto Offramp')).toBeDefined();
    expect(screen.getByText('NGN')).toBeDefined();
    expect(screen.getByText('KES')).toBeDefined();
    expect(screen.getByText('GHS')).toBeDefined();
    expect(screen.getByLabelText(/amount to cash out/i)).toBeDefined();
  });

  it('allows selecting different fiat currencies and changing amount', () => {
    render(
      <Providers>
        <OfframpCard />
      </Providers>,
    );

    const kesButton = screen.getByRole('button', { name: /kes/i });
    fireEvent.click(kesButton);

    const input = screen.getByLabelText<HTMLInputElement>(/amount to cash out/i);
    fireEvent.change(input, { target: { value: '250' } });
    expect(input.value).toBe('250');
  });

  it('shows connect wallet button when disconnected', () => {
    render(
      <Providers>
        <OfframpCard />
      </Providers>,
    );

    const actionBtn = screen.getByRole('button', { name: /connect wallet to continue/i });
    expect(actionBtn).toBeDefined();
  });
});
