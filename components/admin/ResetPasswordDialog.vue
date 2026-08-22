<template>
  <v-dialog
    :model-value="modelValue"
    max-width="500"
    persistent
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title class="text-lg font-semibold">
        パスワードリセット
      </v-card-title>

      <v-card-text>
        <div v-if="user" class="mb-4">
          <p class="text-sm text-gray-600 mb-2">対象ユーザー:</p>
          <div class="bg-gray-50 p-3 rounded-lg">
            <p class="font-medium">{{ user.name }}</p>
            <p class="text-sm text-gray-500">{{ user.email }}</p>
          </div>
        </div>

        <v-form ref="formRef" v-model="isFormValid" @submit.prevent="resetPassword">
          <v-text-field
            v-model="temporaryPassword"
            label="新しい仮パスワード *"
            :type="showPassword ? 'text' : 'password'"
            variant="outlined"
            :rules="passwordRules"
            :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
            hint="ユーザーは次回ログイン時にパスワード変更が必要です"
            persistent-hint
            required
            @click:append-inner="showPassword = !showPassword"
          >
            <template #append>
              <v-btn
                variant="text"
                size="small"
                class="ml-2"
                @click="generatePassword"
              >
                自動生成
              </v-btn>
            </template>
          </v-text-field>
        </v-form>

        <v-alert
          type="warning"
          variant="tonal"
          class="mt-4"
          density="compact"
        >
          <div class="text-sm">
            <strong>注意:</strong>
            新しいパスワードをユーザーに安全な方法でお伝えください。
          </div>
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          :disabled="loading"
          @click="cancel"
        >
          キャンセル
        </v-btn>
        <v-btn
          color="primary"
          :loading="loading"
          :disabled="!isFormValid"
          @click="resetPassword"
        >
          リセット
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import type { User } from '~/types'

const logger = useLogger({ prefix: '[COMPONENT-RESET-PASSWORD-DIALOG]' })
const apiClient = useApiClient()

// Props & Emits
const props = defineProps<{
  modelValue: boolean
  user: User | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'reset': []
}>()

const { showSuccess, showError } = useNotification()

// State
const formRef = ref()
const loading = ref(false)
const isFormValid = ref(false)
const showPassword = ref(false)
const temporaryPassword = ref('')

// Validation rules
const passwordRules = [
  (v: string) => !!v || 'パスワードは必須です',
  (v: string) => v.length >= 8 || 'パスワードは8文字以上で入力してください',
  (v: string) => /(?=.*[a-z])/.test(v) || 'パスワードに小文字を含めてください',
  (v: string) => /(?=.*\d)/.test(v) || 'パスワードに数字を含めてください'
]

// Methods
const resetPassword = async () => {
  if (!props.user) return

  const { valid } = await formRef.value.validate()
  if (!valid) return

  loading.value = true
  
  try {
    await apiClient.post(`/admin/users/${props.user.user_id}/reset-password`, { temporary_password: temporaryPassword.value })

    showSuccess(`${props.user.name}のパスワードをリセットしました`)
    resetForm()
    emit('reset')
  } catch (error) {
    logger.error('パスワードのリセットに失敗しました:', error)
    showError('パスワードのリセットに失敗しました')
  } finally {
    loading.value = false
  }
}

const cancel = () => {
  resetForm()
  emit('update:modelValue', false)
}

const resetForm = () => {
  temporaryPassword.value = ''
  showPassword.value = false
  formRef.value?.resetValidation()
}

const generatePassword = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  let password = ''
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  // Ensure it has at least one lowercase and one number
  temporaryPassword.value = password + '1a'
}

// Auto-generate password on dialog open
watch(() => props.modelValue, (newValue) => {
  if (newValue && !temporaryPassword.value) {
    generatePassword()
  }
})

// Reset form when dialog closes
watch(() => props.modelValue, (newValue) => {
  if (!newValue) {
    resetForm()
  }
})
</script>