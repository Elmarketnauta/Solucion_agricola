// Developed by Marketnauta
import express from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json());

// BCRP TAPP Simulator
// Simulates Phase 4: Payment Initiation
app.post('/tapp/initiate', (req, res) => {
  const { sourcePhone, destinationPhone, amount, sourceBank } = req.body;
  
  if (!sourcePhone || !destinationPhone || !amount) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  // Simulate latency and settlement
  setTimeout(() => {
    // 90% success rate
    if (Math.random() > 0.1) {
      const cceSignature = crypto.randomUUID();
      console.log(`[TAPP Simulator] Settled ${amount} from ${sourceBank} to Yunta (${destinationPhone}). Signature: ${cceSignature}`);
      res.status(200).json({ 
        status: 'Settled',
        cceSignature,
        timestamp: new Date().toISOString()
      });
    } else {
      console.error(`[TAPP Simulator] Failed to settle transaction due to simulated CCE timeout.`);
      res.status(503).json({
        status: 'Failed',
        error: 'CCE_TIMEOUT'
      });
    }
  }, 500); // 500ms latency
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`✅ TAPP Simulator running on http://localhost:${PORT}`);
});
