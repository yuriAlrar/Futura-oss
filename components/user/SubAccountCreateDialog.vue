<template>
  <v-dialog :model-value="modelValue" max-width="500" persistent
    @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="text-lg font-semibold">
        サブアカウント作成
      </v-card-title>

      <v-card-text v-if="!createdResult">
        <v-form ref="formRef" @submit.prevent="submit">
          <div class="space-y-4">
            <v-alert type="info" variant="tonal" density="compact">
              サブアカウントも管理者による承認が必要です。承認されるまでは一部機能が制限される場合があります。
            </v-alert>
            <v-text-field v-model="form.email" label="メールアドレス *" type="email" variant="outlined" :rules="emailRules"
              hint="本アカウントとは別のメールアドレスが必要です" persistent-hint required />
            <v-text-field v-model="form.name" label="氏名 *" variant="outlined" :rules="nameRules" required />
            <v-textarea v-model="form.address" label="住所 *" variant="outlined" rows="3" :rules="addressRules" required />
            <v-text-field v-model="form.phone_number" label="電話番号 *" variant="outlined" :rules="phoneRules" required />
          </div>
        </v-form>
      </v-card-text>

      <!-- Success: show the one-time temporary password -->
      <v-card-text v-else>
        <v-alert type="success" variant="tonal" class="mb-4">
          サブアカウントを作成しました。以下の仮パスワードは今だけ表示されます。サブアカウントの利用者に安全な方法で共有してください。
        </v-alert>
        <div class="space-y-2">
          <div>
            <span class="text-sm text-gray-600">メールアドレス</span>
            <p class="font-mono font-medium">{{ createdResult.user.email }}</p>
          </div>
          <div>
            <span class="text-sm text-gray-600">仮パスワード</span>
            <p class="font-mono font-medium text-lg bg-gray-100 rounded px-3 py-2">{{ createdResult.temporary_password }}</p>
          </div>
        </div>
      </v-card-text>

      <v-card-actions class="flex justify-end gap-2 px-6 pb-6">
        <template v-if="!createdResult">
          <v-btn variant="text" :disabled="loading" @click="cancel">
            キャンセル
          </v-btn>
          <v-btn color="primary" :loading="loading" @click="submit">
            作成
          </v-btn>
        </template>
        <template v-else>
          <v-btn color="primary" @click="close">
            閉じる
          </v-btn>
        </template>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import type { SubAccountCreateForm, SubAccountCreateResult } from '~/types'

const apiClient = useApiClient()
const logger = useLogger({ prefix: '[SubAccountCreateDialog]' })
const { showError } = useNotification()

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: []
}>()

const formRef = ref<any>(null)
const loading = ref(false)
const createdResult = ref<SubAccountCreateResult | null>(null)

const form = reactive<SubAccountCreateForm>({
  email: '',
  name: '',
  address: '',
  phone_number: ''
})

const emailRules = [
  (v: string) => !!v || 'メールアドレスは必須です',
  (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || '有効なメールアドレスを入力してください'
]

const nameRules = [
  (v: string) => !!v || '氏名は必須です'
]

const addressRules = [
  (v: string) => !!v || '住所は必須です'
]

const phoneRules = [
  (v: string) => !!v || '電話番号は必須です'
]

const resetForm = () => {
  form.email = ''
  form.name = ''
  form.address = ''
  form.phone_number = ''
  createdResult.value = null
  formRef.value?.resetValidation()
}

const cancel = () => {
  emit('update:modelValue', false)
}

const close = () => {
  emit('update:modelValue', false)
  emit('created')
}

const submit = async () => {
  const { valid } = await formRef.value.validate()
  if (!valid) return

  loading.value = true
  try {
    const response = await apiClient.post<SubAccountCreateResult>('/account/sub-accounts', form)
    createdResult.value = response.data!
  } catch (error: any) {
    logger.error('サブアカウント作成エラー:', error)
    showError(error?.data?.statusMessage || 'サブアカウントの作成に失敗しました')
  } finally {
    loading.value = false
  }
}

// ダイアログが開かれるたびにフォームをリセットする
watch(() => props.modelValue, (newValue) => {
  if (newValue) {
    resetForm()
  }
})
</script>
