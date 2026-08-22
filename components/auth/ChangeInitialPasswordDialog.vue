<template>
  <v-dialog
    v-model="isOpen"
    max-width="500"
    persistent
  >
    <v-card>
      <v-card-title class="text-h5">
        パスワード変更が必要です
      </v-card-title>
      
      <v-card-text>
        <p class="mb-4 text-body-2">
          初回ログインのため、新しいパスワードを設定してください。
        </p>
        
        <v-form
          ref="formRef"
          v-model="isFormValid"
          @submit.prevent="handleSubmit"
        >
          <!-- Current Password (Read Only) -->
          <v-text-field
            :model-value="credentials.temporaryPassword"
            label="現在のパスワード（一時）"
            type="password"
            variant="outlined"
            readonly
            class="mb-4"
          />
          
          <!-- New Password -->
          <CommonPasswordField
            v-model="credentials.newPassword"
            label="新しいパスワード"
            :rules="newPasswordRules"
            confirm
            confirm-label="新しいパスワード（確認）"
            class="mb-4"
          />
          
          <!-- Password Requirements -->
          <v-card
            variant="outlined"
            class="mb-4"
          >
            <v-card-text class="py-3">
              <p class="text-body-2 mb-2 font-weight-medium">パスワード要件:</p>
              <ul class="text-body-2">
                <li>8文字以上</li>
                <li>大文字を含む</li>
                <li>小文字を含む</li>
                <li>数字を含む</li>
              </ul>
            </v-card-text>
          </v-card>
          
          <!-- Error Message -->
          <v-alert
            v-if="errorMessage"
            type="error"
            variant="outlined"
            class="mb-4"
          >
            {{ errorMessage }}
          </v-alert>
        </v-form>
      </v-card-text>
      
      <v-card-actions>
        <v-spacer />
        <v-btn
          type="submit"
          color="primary"
          :loading="loading"
          :disabled="!isFormValid"
          @click="handleSubmit"
        >
          パスワード変更
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import type { ChangeInitialPasswordRequest } from '~/types'

const logger = useLogger({ prefix: '[COMPONENT-CHANGE-INITIAL-PASSWORD]' })
const apiClient = useApiClient()

// Props
interface Props {
  modelValue: boolean
  email: string
  temporaryPassword: string
  session: string
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'success': [authResult: any]
}>()

// Reactive state
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const formRef = ref()
const isFormValid = ref(false)
const loading = ref(false)
const errorMessage = ref('')

const credentials = reactive({
  temporaryPassword: computed(() => props.temporaryPassword),
  newPassword: ''
})

// Validation rules
const newPasswordRules = [
  (v: string) => !!v || 'パスワードは必須です',
  (v: string) => v.length >= 8 || 'パスワードは8文字以上である必要があります',
  (v: string) => /[A-Z]/.test(v) || '大文字を含む必要があります',
  (v: string) => /[a-z]/.test(v) || '小文字を含む必要があります',
  (v: string) => /[0-9]/.test(v) || '数字を含む必要があります'
]

// Methods
const handleSubmit = async () => {
  if (!isFormValid.value) return

  loading.value = true
  errorMessage.value = ''

  try {
    const requestData: ChangeInitialPasswordRequest = {
      email: props.email,
      temporaryPassword: props.temporaryPassword,
      newPassword: credentials.newPassword,
      session: props.session
    }

    const response = await apiClient.post('/auth/change-initial-password', requestData)

    if (!response.success) {
      errorMessage.value = response.error || 'パスワード変更に失敗しました'
      return
    }

    emit('success', response.data.authenticationResult)
    isOpen.value = false
  } catch (error: unknown) {
    logger.error('パスワード変更エラー:', error)
    errorMessage.value = 'パスワード変更に失敗しました'
  } finally {
    loading.value = false
  }
}

// Reset form when dialog opens
watch(isOpen, (newValue) => {
  if (newValue) {
    credentials.newPassword = ''
    errorMessage.value = ''
  }
})
</script>

<style scoped>
.v-card {
  border-radius: 12px;
}
</style>