<template>
  <v-dialog :model-value="modelValue" max-width="500" @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="text-lg font-semibold">
        取引詳細
      </v-card-title>

      <v-card-text v-if="transaction">
        <div class="space-y-4">
          <!-- Transaction Type -->
          <div class="flex items-center justify-between py-3 border-b">
            <span class="text-gray-600">取引種別</span>
            <v-chip :color="getTransactionTypeColor(transaction.transaction_type)" size="small" variant="flat">
              <Icon :name="getTransactionTypeIcon(transaction.transaction_type)" class="mr-1" />
              {{ getTransactionTypeLabel(transaction.transaction_type) }}
            </v-chip>
          </div>

          <!-- Amount -->
          <div class="flex items-center justify-between py-3 border-b">
            <span class="text-gray-600">金額</span>
            <span class="font-mono font-semibold text-lg"
              :class="getTransactionTypeTextColor(transaction.transaction_type)">
              {{ getTransactionTypeSign(transaction.transaction_type, transaction.amount) }}¥{{
                formatNumber(Math.abs(transaction.amount)) }}
            </span>
          </div>

          <!-- Timestamp -->
          <div class="flex items-center justify-between py-3 border-b">
            <span class="text-gray-600">実行日時</span>
            <span class="font-medium">{{ formatDateTime(transaction.timestamp) }}</span>
          </div>

          <!-- Memo -->
          <div class="py-3 border-b">
            <p class="text-gray-600 mb-2">内容</p>
            <p class="text-sm bg-gray-50 p-3 rounded-lg">{{ transaction.memo }}</p>
          </div>

          <!-- Reason -->
          <div class="py-3 border-b">
            <p class="text-gray-600 mb-2">処理理由</p>
            <p class="text-sm bg-gray-50 p-3 rounded-lg">{{ transaction.reason }}</p>
          </div>

          <!-- Transaction ID -->
          <div class="py-3">
            <p class="text-gray-600 mb-2">取引ID</p>
            <code class="text-xs bg-gray-100 px-3 py-2 rounded font-mono block break-all">
              {{ transaction.transaction_id }}
            </code>
          </div>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">
          閉じる
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import type { Transaction } from '~/types'
import {
  getTransactionTypeLabel,
  getTransactionTypeColor,
  getTransactionTypeIcon,
  getTransactionTypeTextColor,
  getTransactionTypeSign
} from '~/utils/transaction'
import { formatNumber } from '~/utils/format'

// Props & Emits
const _props = defineProps<{
  modelValue: boolean
  transaction: Transaction | null
}>()

const _emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

// Utility functions
const formatDateTime = (dateString: string) => {
  return new Date(dateString).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}
</script>