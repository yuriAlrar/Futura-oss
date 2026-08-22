<template>
  <v-dialog :model-value="modelValue" max-width="500" persistent
    @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="text-lg font-semibold text-red-700">
        {{ props.request.transaction_type === 'deposit' ? '入金' : '出金' }}リクエストを拒否
      </v-card-title>

      <v-card-text>
        <div v-if="request" class="space-y-4">
          <!-- Request Info -->
          <div class="bg-gray-50 p-4 rounded-lg">
            <h4 class="font-medium text-gray-800 mb-2">リクエスト詳細</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span class="text-gray-600">ユーザー:</span>
                <span class="ml-2 font-medium">{{ request.user_name }}</span>
              </div>
              <div>
                <span class="text-gray-600">金額:</span>
                <span class="ml-2 font-mono">¥{{ formatNumber(Math.abs(request.amount)) }}</span>
              </div>
              <div class="col-span-2">
                <span class="text-gray-600">理由:</span>
                <span class="ml-2">{{ request.reason }}</span>
              </div>
              <div v-if="request.memo" class="col-span-2">
                <span class="text-gray-600">メモ:</span>
                <span class="ml-2">{{ request.memo }}</span>
              </div>
            </div>
          </div>

          <!-- Rejection Form -->
          <v-form ref="formRef" @submit.prevent="rejectRequest">
            <v-textarea v-model="rejectionReason" label="拒否理由 *" variant="outlined" rows="4" :rules="reasonRules"
              required maxlength="500" counter hint="ユーザーに表示される拒否理由を入力してください" persistent-hint />
          </v-form>

          <!-- Warning -->
          <v-alert color="warning" variant="tonal" class="text-sm">
            この操作は取り消せません。拒否後はユーザーに通知され、新しいリクエストの送信が可能になります。
          </v-alert>
        </div>
      </v-card-text>

      <v-card-actions class="flex justify-end gap-2 px-6 pb-6">
        <button type="button" class="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          @click="$emit('update:modelValue', false)">
          キャンセル
        </button>
        <button type="button"
          class="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          :disabled="loading" @click="rejectRequest">
          <span v-if="loading">拒否中...</span>
          <span v-else>拒否する</span>
        </button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { TRANSACTION_STATUS } from '~/types'
import { formatNumber } from '~/utils/format'

const apiClient = useApiClient()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'request-processed': []
}>()

const props = defineProps<{
  modelValue: boolean
  request: any | null
}>()

const formRef = ref<any>(null)
const loading = ref(false)
const rejectionReason = ref('')

// Validation rules
const reasonRules = [
  (v: string) => !!v || '拒否理由は必須です',
  (v: string) => v.length >= 10 || '拒否理由は10文字以上で入力してください',
  (v: string) => v.length <= 500 || '拒否理由は500文字以下で入力してください'
]

// Reset form when dialog opens
watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    rejectionReason.value = ''
  }
})

// Methods
const rejectRequest = async () => {
  if (!formRef.value || !props.request) return

  const { valid } = await formRef.value.validate()
  if (!valid) return

  loading.value = true

  try {
    const response = await apiClient.patch(`/admin/transactions/${props.request.transaction_id}/status`, {
      status: TRANSACTION_STATUS.REJECTED,
      rejection_reason: rejectionReason.value
    })

    useNotification().showSuccess(`${props.request.user_name}さんの${props.request.transaction_type === 'deposit' ? '入金' : '出金'}リクエストを拒否しました`)

    emit('request-processed')
    emit('update:modelValue', false)

  } catch (error: any) {
    useNotification().showError(error?.data?.message || '拒否処理に失敗しました')
  } finally {
    loading.value = false
  }
}

</script>