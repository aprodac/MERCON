import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet,
  StatusBar, FlatList, ActivityIndicator, RefreshControl, Alert, TextInput, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  FileText, Truck, Calendar, Clock,
} from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '@mercon/mobile-shared/theme/tokens';
import { StatusBadge } from '@mercon/mobile-shared/components/Badge';
import { Button } from '@mercon/mobile-shared/components/Button';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { operatorService, useOperatorInvoices, type OperatorInvoice, type OperatorPaymentAccount } from '../../../lib/operator';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { matchesSearch } from '@mercon/mobile-shared/lib/search';
import { AppTopBar } from '@/components/AppTopBar';
import { FilterChips } from '@/components/FilterChips';
import { ListSearch, listPage } from '@/components/ListSearch';

const FILTERS: { key: string; label?: string; dot?: string }[] = [
  { key: 'All' },
  // Keys are the backend's InvoiceStatus values.
  { key: 'Issued', dot: Colors.warning },
  { key: 'PartiallyPaid', label: 'Part paid', dot: Colors.error },
  { key: 'Paid', dot: Colors.success },
  { key: 'Draft', dot: '#9898A4' },
  { key: 'Void', dot: '#9898A4' },
];

function money(currency: string, n: number): string {
  return `${currency} ${Math.round(n).toLocaleString()}`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const InvoiceCard = ({ item, onMarkPaid }: { item: OperatorInvoice; onMarkPaid: (id: string) => void }) => {
  const [paying, setPaying] = useState(false);
  const [marking, setMarking] = useState(false);
  const [accounts, setAccounts] = useState<OperatorPaymentAccount[] | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  // Only an issued invoice with money still owed can take a payment.
  const due = Number(item.balance_due ?? item.total_amount) || 0;
  const canMarkPaid = (item.status === 'Issued' || item.status === 'PartiallyPaid') && due > 0;

  const handleMarkPaid = async () => {
    setAmount(String(due));
    setPaying(true);
    if (accounts) return;
    try {
      const list = await operatorService.paymentAccounts();
      setAccounts(list);
      if (list.length === 1) setAccountId(list[0].accountId);
    } catch (e) {
      setPaying(false);
      Alert.alert('Could not load accounts', getApiErrorMessage(e));
    }
  };

  // Overdue is not a stored status: it is an unpaid invoice past its due date.
  const overdue = canMarkPaid && !!item.due_date && new Date(item.due_date).getTime() < Date.now();

  const parsedAmount = Number(amount);
  const amountOk = Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= due;

  const submitPayment = async () => {
    if (!accountId || !amountOk) return;
    setMarking(true);
    try {
      await operatorService.recordInvoicePayment(item.id, {
        amount: parsedAmount,
        accountId,
        payment_date: new Date().toISOString(),
      });
      setPaying(false);
      onMarkPaid(item.id);
    } catch (e) {
      Alert.alert('Could not record payment', getApiErrorMessage(e));
    } finally {
      setMarking(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View>
          <Text style={styles.invoiceId}>{item.ref_id ?? item.id.slice(0, 8)}</Text>
          <Text style={styles.customer}>{item.customer?.name ?? 'Customer'}</Text>
        </View>
        <View style={styles.amountCol}>
          <Text style={styles.amount}>{money(item.currency, item.total_amount)}</Text>
          <StatusBadge status={item.status} />
        </View>
      </View>
      <View style={styles.cardMeta}>
        {item.trip?.ref_id ? (
          <View style={styles.metaItem}>
            <Truck size={13} color={Colors.gray500} strokeWidth={2} />
            <Text style={styles.metaText}>{item.trip.ref_id}</Text>
          </View>
        ) : null}
        <View style={styles.metaItem}>
          <Calendar size={13} color={Colors.gray500} strokeWidth={2} />
          <Text style={styles.metaText}>Issued: {formatDate(item.createdAt)}</Text>
        </View>
        <View style={styles.metaItem}>
          <Clock size={13} color={overdue ? Colors.error : Colors.gray500} strokeWidth={2} />
          <Text style={[styles.metaText, overdue ? styles.overdueText : null]}>
            Due: {formatDate(item.due_date)}
          </Text>
        </View>
      </View>
      {canMarkPaid && (
        <Button
          variant="success"
          size="sm"
          label="Record Payment"
          onPress={handleMarkPaid}
        />
      )}
      <AppModal visible={paying} onClose={() => setPaying(false)} type="bottom-sheet" title={`Payment · ${item.ref_id ?? item.id.slice(0, 8)}`}>
        <View style={styles.payForm}>
          <Text style={styles.payLabel}>Amount received ({item.currency}) — {money(item.currency, due)} due</Text>
          <TextInput
            style={styles.payInput}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
          <Text style={styles.payLabel}>Received into</Text>
          {accounts === null ? (
            <ActivityIndicator color={Colors.primary} />
          ) : accounts.length === 0 ? (
            <Text style={styles.payHint}>No cash or bank account is set up yet. Add one on the web dashboard under Finance.</Text>
          ) : (
            accounts.map((a) => (
              <TouchableOpacity
                key={a.accountId}
                style={[styles.payAccount, accountId === a.accountId ? styles.payAccountOn : null]}
                activeOpacity={0.7}
                onPress={() => setAccountId(a.accountId)}
              >
                <Text style={styles.payAccountText}>{a.name}</Text>
              </TouchableOpacity>
            ))
          )}
          <Button
            variant="success"
            size="sm"
            label={marking ? 'Saving…' : 'Save Payment'}
            loading={marking}
            disabled={!accountId || !amountOk}
            onPress={submitPayment}
          />
        </View>
      </AppModal>
    </View>
  );
};

const InvoiceListScreen = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const { invoices, loading, error, refetch } = useOperatorInvoices();

  const first = loading && invoices.length === 0;
  const count = (status: string) => invoices.filter((i) => i.status === status).length;

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter !== 'All' && inv.status !== statusFilter) return false;
      return matchesSearch(search, [inv.ref_id, inv.customer?.name, inv.trip?.ref_id]);
    });
  }, [invoices, statusFilter, search]);
  const shownValue = filtered.reduce((sum, i) => sum + i.total_amount, 0);

  return (
    <SafeAreaView style={listPage.page} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F6F6F7" />
      <AppTopBar title="Invoices" />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={listPage.list}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        refreshControl={<RefreshControl refreshing={loading && invoices.length > 0} onRefresh={refetch} />}
        ListHeaderComponent={
          <View style={listPage.header}>
            <FilterChips<string>
              value={statusFilter}
              onChange={setStatusFilter}
              items={FILTERS.map((f) => ({
                key: f.key,
                label: f.label ?? f.key,
                dot: f.dot,
                count: first ? '–' : f.key === 'All' ? invoices.length : count(f.key),
              }))}
            />
            <ListSearch value={search} onChangeText={setSearch} placeholder="Search invoice, customer or trip" />
            {!first ? (
              <Text style={listPage.count}>
                {filtered.length} {filtered.length === 1 ? 'invoice' : 'invoices'}  ·  SAR {Math.round(shownValue).toLocaleString()}
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <InvoiceCard item={item} onMarkPaid={() => refetch()} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing['3xl'] }} />
          ) : (
            <View style={styles.empty}>
              <FileText size={44} color={Colors.gray400} strokeWidth={1.6} />
              <Text style={styles.emptyText}>{error ?? 'No invoices found'}</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  payForm: { gap: Spacing.md, paddingBottom: Spacing.lg },
  payLabel: { fontSize: Typography.xs, fontWeight: '700', color: Colors.gray500 },
  payHint: { fontSize: Typography.sm, color: Colors.gray500 },
  payInput: {
    borderWidth: 1, borderColor: Colors.gray400, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: Typography.sm, color: Colors.charcoal,
  },
  payAccount: {
    borderWidth: 1, borderColor: Colors.gray400, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  payAccountOn: { borderColor: Colors.primary, borderWidth: 2 },
  payAccountText: { fontSize: Typography.sm, fontWeight: '700', color: Colors.charcoal },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    ...Shadows.sm,
    gap: Spacing.md,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  invoiceId: {
    fontSize: Typography.sm,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  customer: {
    fontSize: Typography.xs,
    color: Colors.gray600,
    marginTop: 2,
  },
  amountCol: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  amount: {
    fontSize: Typography.base,
    fontWeight: '800',
    color: Colors.charcoal,
  },
  cardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: Typography.xs,
    color: Colors.gray500,
  },
  overdueText: {
    color: Colors.error,
    fontWeight: '700',
  },
  empty: {
    alignItems: 'center',
    paddingTop: Spacing['3xl'],
    gap: Spacing.sm,
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyText: {
    fontSize: Typography.base,
    color: Colors.gray500,
  },
});

export default InvoiceListScreen;
