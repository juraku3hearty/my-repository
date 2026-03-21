const express = require('express');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const CONFIG = {
  LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
};

async function webhookHandler(req, res) {
  try {
    const params = req.query || {};
    const body = req.body || {};

    // GAS: if (body.destination && Array.isArray(body.events)) return handleLineWebhook(body);
    if (body.destination && Array.isArray(body.events)) {
      await handleLineWebhook(body);
      return res.status(200).send('OK');
    }

    // GAS: if (params.item_id || params.order_id) return handleRobopayIPN(params);
    if (params.item_id || params.order_id) {
      await handleRobopayIPN(params);
      return res.status(200).send('OK');
    }

    // GAS: if (body.type && body.type.startsWith('payment')) return handleSquareWebhook(body);
    if (body.type && body.type.startsWith('payment')) {
      await handleSquareWebhook(body);
      return res.status(200).send('OK');
    }
  } catch (err) {
    console.error('doPost error:', err.message);
  }

  return res.status(200).send('OK');
}

// Vercel環境/ローカル実行のどちらでも受け取りやすいように両方を許可
app.post(['/', '/api/webhook'], webhookHandler);

async function handleLineWebhook(body) {
  for (const event of body.events || []) {
    if (event?.type !== 'message') continue;
    const lineUserId = event?.source?.userId;
    const text = event?.message?.text || '';

    console.log('LINE message:', { lineUserId, text });
    // 必要に応じて reply API / DB更新 / 外部連携をここに実装
  }
}

async function handleRobopayIPN(params) {
  const { status, item_id, email, order_id } = params;
  if (status !== 'success') return;

  console.log('Robopay paid:', { item_id, email, order_id });
  // GASの upsertCustomerByEmail / 会員処理をここに移植
}

async function handleSquareWebhook(body) {
  if (body.type !== 'payment.completed') return;

  const payment = body?.data?.object?.payment;
  const email = payment?.buyer_email_address || '';
  const amountYen = payment?.amount_money?.amount || 0;

  console.log('Square payment:', { email, amountYen, paymentId: payment?.id });
  // GASの upsertCustomerByEmail / LINE通知をここに移植
}

module.exports = app;

