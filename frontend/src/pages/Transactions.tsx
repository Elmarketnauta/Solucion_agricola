import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTransactions, useFormatter } from '../hooks';

type Filter = 'all' | 'in' | 'out';

export default function Transactions() {
  const { user } = useAuth();
  const { transactions, loading, page, totalPages, loadMore } = useTransactions(20);
  const { formatAmount, formatDate, formatTime } = useFormatter();
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = transactions.filter(tx => {
    if (filter === 'in') return tx.receiverPhone === user?.phoneNumber;
    if (filter === 'out') return tx.senderPhone === user?.phoneNumber;
    return true;
  });

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'in', label: 'Cobros' },
    { key: 'out', label: 'Envíos' },
  ];

  return (
    <div className="animate-in">
      <h2 className="mb-lg">Historial</h2>

      <div className="flex gap-sm mb-lg">
        {filters.map(f => (
          <button key={f.key}
            className={`btn ${filter === f.key ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <div className="flex flex-col gap-md">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="flex items-center gap-md">
                <div className="skeleton skeleton-circle" />
                <div className="flex flex-col gap-sm flex-1">
                  <div className="skeleton skeleton-text" />
                  <div className="skeleton skeleton-text-short" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <p className="text-muted">Sin transacciones</p>
          </div>
        ) : (
          <div className="tx-list">
            {filtered.map(tx => {
              const isIn = tx.receiverPhone === user?.phoneNumber;
              const dateStr = formatDate(tx.createdAt);
              const timeStr = formatTime(tx.createdAt);
              return (
                <div key={tx.id} className="tx-item">
                  <div className={`tx-icon ${isIn ? 'tx-icon-in' : 'tx-icon-out'}`}>
                    {isIn ? '↓' : '↑'}
                  </div>
                  <div className="tx-details">
                    <div className="tx-title">
                      {isIn ? `Cobro de ${tx.senderPhone || tx.interoperableSource}` : `Envío a ${tx.receiverPhone}`}
                    </div>
                    <div className="tx-subtitle">{dateStr} · {timeStr}</div>
                  </div>
                  <div className="tx-amount">
                    <div className={`tx-amount-value ${isIn ? 'tx-amount-in' : 'tx-amount-out'}`}>
                      {isIn ? '+' : '-'} S/ {formatAmount(tx.amount)}
                    </div>
                    <span className={`badge ${tx.status === 'Settled' ? 'badge-success' : 'badge-warning'} tx-status`}>
                      {tx.status === 'Settled' ? 'Completado' : tx.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {totalPages > page && (
        <div className="flex justify-center mt-lg">
          <button className="btn btn-secondary" onClick={loadMore}>Cargar más</button>
        </div>
      )}
    </div>
  );
}
