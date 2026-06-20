import crypto from 'crypto';

async function simulateYapePayment() {
  const payload = {
    amount: 150.00,
    destinationPhone: '+51999888777', // Doña Rosa
    sourceApp: 'Yape',
    cceSignature: crypto.randomUUID()
  };

  console.log(`Simulando pago entrante desde Yape por S/ ${payload.amount} a Doña Rosa...`);

  try {
    const response = await fetch('http://localhost:3000/api/webhook/interoperable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log('Respuesta del Backend de Yunta:', result);
  } catch (error) {
    console.error('Error al simular el pago:', error);
  }
}

simulateYapePayment();
