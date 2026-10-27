import { test, expect } from '@playwright/test';
import { Keypair, TransactionBuilder, Account, Operation, Networks } from '@stellar/stellar-sdk';

test.describe('End-to-End Bridge Journey', () => {
  const testKeypair = Keypair.random();
  const testPublicKey = testKeypair.publicKey();

  test.beforeEach(async ({ page }) => {
    // 1. Inject automated test wallet
    await page.addInitScript(
      ({ pubKey }) => {
        window.__LUMENFLOW_TEST_WALLET__ = {
          publicKey: pubKey,
          signTransaction: async (xdr: string) => {
            return { signedTxXdr: xdr };
          },
        };
      },
      { pubKey: testPublicKey },
    );

    // 2. Mock auth endpoints
    await page.route('**/auth/challenge', async (route) => {
      const serverAccount = new Account(
        'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI',
        '0',
      );
      const tx = new TransactionBuilder(serverAccount, {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.manageData({
            name: 'SEP10 auth challenge',
            value: 'lumenflow-test',
          }),
        )
        .setTimeout(300)
        .build();

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          transaction: tx.toXDR(),
          networkPassphrase: Networks.TESTNET,
        }),
      });
    });

    await page.route('**/auth/verify', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'mock-jwt-bridge-token',
          user: {
            id: 'user-e2e-bridge',
            publicKey: testPublicKey,
          },
        }),
      });
    });

    // 3. Mock bridge endpoints
    await page.route('**/bridge/routes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'stellar-eth-usdc',
            fromChain: 'stellar',
            toChain: 'ethereum',
            fromAsset: 'USDC',
            toAsset: 'USDC',
            minAmount: '10',
            maxAmount: '50000',
            estimatedDurationSeconds: 120,
            enabled: true,
          },
        ]),
      });
    });

    await page.route('**/bridge/quote', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'b83c749a-68a8-444a-939e-2ef539db4901',
          provider: 'MockBridge',
          fromChain: 'stellar',
          toChain: 'ethereum',
          fromAsset: 'USDC',
          toAsset: 'USDC',
          fromAmount: '100',
          toAmount: '99.7500',
          estimatedDurationSeconds: 120,
          fee: { amount: '0.2500', asset: 'USDC' },
          rate: '1.0000',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        }),
      });
    });

    await page.route('**/bridge/transfer', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          order: {
            id: 'ord-bridge-e2e-1',
            userId: 'user-e2e-bridge',
            type: 'BRIDGE',
            status: 'AWAITING_SIGNATURE',
            sourceAsset: { type: 'token', chain: 'stellar', code: 'USDC' },
            destinationAsset: { type: 'token', chain: 'ethereum', code: 'USDC' },
            sourceAmount: '100',
            destinationAmount: '99.7500',
            quoteId: 'b83c749a-68a8-444a-939e-2ef539db4901',
            externalId: 'br_e2e_transfer_1',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          transfer: {
            transferId: 'br_e2e_transfer_1',
            provider: 'MockBridge',
            fromChain: 'stellar',
            toChain: 'ethereum',
            unsignedTransaction: 'mock-base64-unsigned-bridge-tx',
            sender: testPublicKey,
            depositAddress: 'GBRIDGEHOLDINGTESTNETOPERATORADDRESS7X7X7X7X7X7X7X7X7X7X7X7',
            memo: 'LF-BR-123456',
          },
        }),
      });
    });

    await page.route('**/bridge/transfer/*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          order: {
            id: 'ord-bridge-e2e-1',
            userId: 'user-e2e-bridge',
            type: 'BRIDGE',
            status: 'COMPLETED',
            sourceAmount: '100',
            destinationAmount: '99.7500',
            externalId: 'br_e2e_transfer_1',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          status: {
            transferId: 'br_e2e_transfer_1',
            provider: 'MockBridge',
            status: 'COMPLETED',
            fromTxHash: '3d5a4bf893e11234567890abcdef1234567890abcdef1234567890abcdef1234',
            toTxHash: '0x88f28c11aa234567890abcdef1234567890abcdef1234567890abcdef1234',
            confirmations: 24,
            requiredConfirmations: 24,
            updatedAt: new Date().toISOString(),
          },
        }),
      });
    });
  });

  test('completes full cross-chain bridge transfer from quote to completed status', async ({ page }) => {
    // 1. Visit bridge page
    await page.goto('/bridge');
    await expect(page.getByRole('heading', { name: 'Cross-Chain Bridge', exact: true })).toBeVisible();

    // 2. Connect wallet
    const headerConnectBtn = page.getByRole('button', { name: 'Connect Wallet', exact: true });
    await headerConnectBtn.click();
    await page.getByRole('button', { name: /testnet dev wallet/i }).click();

    // Verify wallet connection in header
    const truncated = `${testPublicKey.slice(0, 4)}...${testPublicKey.slice(-4)}`;
    await expect(page.getByText(truncated)).toBeVisible();

    // 3. Review Transfer
    const reviewBtn = page.getByRole('button', { name: /review transfer/i });
    await expect(reviewBtn).toBeEnabled();
    await reviewBtn.click();

    // 4. Continue to Sign
    const continueBtn = page.getByRole('button', { name: /continue to sign/i });
    await expect(continueBtn).toBeVisible();
    await continueBtn.click();

    // 5. Sign & Broadcast
    await expect(page.getByText(/Non-Custodial Wallet Signing/i)).toBeVisible();
    const signBtn = page.getByRole('button', { name: /sign & broadcast transaction/i });
    await signBtn.scrollIntoViewIfNeeded();
    await signBtn.click({ force: true });

    // 6. Verify Completed state
    await expect(page.getByText(/Bridge transfer completed successfully!/i)).toBeVisible({
      timeout: 10000,
    });
  });
});
