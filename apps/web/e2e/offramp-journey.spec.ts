import { test, expect } from '@playwright/test';
import { Keypair, TransactionBuilder, Account, Operation, Networks } from '@stellar/stellar-sdk';

test.describe('End-to-End Offramp Journey', () => {
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
          token: 'mock-jwt-session-token',
          user: {
            id: 'user-e2e-offramp',
            publicKey: testPublicKey,
          },
        }),
      });
    });

    // 3. Mock offramp quote
    await page.route('**/offramp/quote', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'quote-offramp-e2e-123',
          sourceAsset: {
            type: 'credit_alphanum4',
            code: 'USDC',
            issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
          },
          destinationCurrency: 'NGN',
          sourceAmount: '100.0000000',
          destinationAmount: '154000.00',
          exchangeRate: '1550.00',
          feeBreakdown: {
            anchorFee: '0.5000000',
            networkFee: '0.0000100',
            platformFee: '0.2500000',
            totalFee: '0.7500100',
          },
          rateLockDurationSeconds: 600,
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          createdAt: new Date().toISOString(),
        }),
      });
    });

    // 4. Mock offramp order creation
    await page.route('**/offramp/orders', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            order: {
              id: 'order-offramp-e2e-456',
              userId: 'user-e2e-offramp',
              type: 'OFFRAMP',
              status: 'AWAITING_SIGNATURE',
              sourceAsset: {
                type: 'credit_alphanum4',
                code: 'USDC',
                issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
              },
              destinationAsset: { type: 'fiat', code: 'NGN' },
              sourceAmount: '100.0000000',
              destinationAmount: '154000.00',
              quoteId: 'quote-offramp-e2e-123',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            interactiveUrl: 'http://localhost:4001/interactive?transaction_id=sep24-tx-e2e',
            anchorTxId: 'sep24-tx-e2e',
          }),
        });
      } else {
        await route.continue();
      }
    });

    // 5. Mock interactive complete & webhook simulation
    await page.route('**/interactive/complete', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          transaction: {
            withdraw_anchor_account: 'GB54GB4VDDWRDWQDGYEFX5UWFEQP7B73HRGWGCU3LDFWCU3HJ5O5N5CW',
            withdraw_memo: 'lf-e2e-memo',
          },
        }),
      });
    });

    await page.route('**/api/trigger-webhook', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ webhookDelivered: true }),
      });
    });
  });

  test('completes full offramp journey from quote to payout completed', async ({ page }) => {
    // Navigate to homepage
    await page.goto('/');

    // 1. Connect wallet
    const connectBtn = page.getByRole('button', { name: 'Connect Wallet', exact: true });
    await expect(connectBtn).toBeVisible();
    await connectBtn.click();

    // Select testnet dev wallet
    const testWalletBtn = page.getByRole('button', { name: /testnet dev wallet/i });
    await expect(testWalletBtn).toBeVisible();
    await testWalletBtn.click();

    // Verify wallet connected
    await expect(page.getByText(/G[A-Z0-9]{3}\.\.\.[A-Z0-9]{4}/)).toBeVisible();

    // 2. Navigate to Offramp page via Header
    const offrampLink = page.getByRole('link', { name: 'Offramp' }).first();
    await expect(offrampLink).toBeVisible();
    await offrampLink.click();
    await expect(page).toHaveURL(/.*\/offramp/);

    // 3. Step 1: Quote & Currency
    await expect(page.getByText('Crypto Offramp')).toBeVisible();
    await expect(page.getByText(/Rate Guaranteed/i)).toBeVisible();
    await expect(page.getByText(/remaining/i)).toBeVisible();
    await expect(page.getByText(/Total Fees/i)).toBeVisible();

    const continueBtn = page.getByRole('button', { name: /continue to kyc verification/i });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // 4. Step 2: KYC Tier
    await expect(page.getByText('KYC Verification Status')).toBeVisible();
    await expect(page.getByText('Tier 1 Verified')).toBeVisible();
    const proceedToPayoutBtn = page.getByRole('button', { name: /proceed to payout details/i });
    await expect(proceedToPayoutBtn).toBeVisible();
    await proceedToPayoutBtn.click();

    // 5. Step 3: Anchor Hosted Flow (Bank Details)
    await expect(page.getByText('Anchor Hosted Flow (SEP-24)')).toBeVisible();
    const confirmBankBtn = page.getByRole('button', { name: /confirm payout details/i });
    await expect(confirmBankBtn).toBeVisible();
    await confirmBankBtn.click();

    // 6. Step 4: Sign Payment in Wallet
    await expect(page.getByText('Sign Payment to Anchor')).toBeVisible();
    await expect(page.getByText('Anchor Recipient Account')).toBeVisible();
    const signBtn = page.getByRole('button', { name: /sign in wallet/i });
    await expect(signBtn).toBeVisible();
    await signBtn.click();

    // 7. Step 5: Status Tracking -> Payout Completed
    await expect(page.getByText('Offramp Progress')).toBeVisible();
    await expect(page.getByText('Payout Completed!')).toBeVisible({ timeout: 10000 });
  });
});
