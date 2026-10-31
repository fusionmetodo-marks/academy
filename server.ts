import express from 'express';
import path from 'path';
import cors from 'cors';
import webpush from 'web-push';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || 'BH78AfuxrLzczmvgRlw_wBSCsjwjjOyvtckmd__4OEzEVDHF894rS7848ZC3rMbIsQ9gSyRhX85PuCAzFPouLdY';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || '-uGUUBJgbXtlcyzpSKtKWAOTxYdTMh95Xosnd4PRi5Q';

webpush.setVapidDetails(
  'mailto:grupocassaminha@gmail.com',
  publicVapidKey,
  privateVapidKey
);

app.get('/api/push/vapidPublicKey', (req, res) => {
  res.json({ publicKey: publicVapidKey });
});

app.post('/api/push/send', async (req, res) => {
  const { subscriptions, payload } = req.body;
  
  if (!subscriptions || !Array.isArray(subscriptions)) {
    return res.status(400).json({ error: 'Subscriptions array is required' });
  }

  const pushPayload = JSON.stringify({
    title: payload.title || 'CFA Academy',
    body: payload.body || 'Nova notificação!',
    url: payload.url || '/dashboard'
  });

  const promises = subscriptions.map(sub => 
    webpush.sendNotification(sub, pushPayload).catch(err => {
      console.error('Error sending push to a subscription', err);
      return { status: 'failed', sub };
    })
  );

  await Promise.all(promises);
  res.status(200).json({ success: true });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
