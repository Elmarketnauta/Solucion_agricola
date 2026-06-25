// Developed by Marketnauta
export function useFormatter() {
  const formatAmount = (amount: number, locale = 'es-PE'): string => {
    return amount.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const formatDate = (dateString: string, locale = 'es-PE'): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale, {
      day: '2-digit',
      month: 'short'
    });
  };

  const formatTime = (dateString: string, locale = 'es-PE'): string => {
    const date = new Date(dateString);
    return date.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDateTime = (dateString: string, locale = 'es-PE'): string => {
    return `${formatDate(dateString, locale)} · ${formatTime(dateString, locale)}`;
  };

  const formatPhone = (phone: string | null | undefined): string => {
    if (!phone) return '';
    return phone.replace(/^\+51(\d{3})(\d{3})(\d{3})$/, '+51 $1 $2 $3');
  };

  return {
    formatAmount,
    formatDate,
    formatTime,
    formatDateTime,
    formatPhone,
  };
}
