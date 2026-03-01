<template>
  <div class="p-6">
    <div class="max-w-md mx-auto">
      <div class="mb-6 text-center">
        <h1 class="text-2xl font-bold text-gray-900 mb-2">パスワード変更</h1>
        <p class="text-gray-600">セキュリティのため、定期的にパスワードを変更することをお勧めします</p>
      </div>

      <v-card class="card-shadow">
        <v-card-text class="p-6">
          <v-form ref="formRef" @submit.prevent="changePassword">
            <div class="space-y-4">
              <v-text-field v-model="form.currentPassword" label="現在のパスワード *"
                :type="showCurrentPassword ? 'text' : 'password'" variant="outlined" :rules="currentPasswordRules"
                :append-inner-icon="showCurrentPassword ? 'mdi-eye' : 'mdi-eye-off'" autocomplete="current-password"
                required @click:append-inner="showCurrentPassword = !showCurrentPassword" />

              <v-text-field v-model="form.newPassword" label="新しいパスワード *" :type="showNewPassword ? 'text' : 'password'"
                variant="outlined" :rules="newPasswordRules"
                :append-inner-icon="showNewPassword ? 'mdi-eye' : 'mdi-eye-off'" autocomplete="new-password"
                hint="8文字以上、小文字・数字を含む" persistent-hint required
                @click:append-inner="showNewPassword = !showNewPassword" />

              <v-text-field v-model="form.confirmPassword" label="新しいパスワード（確認） *"
                :type="showConfirmPassword ? 'text' : 'password'" variant="outlined" :rules="confirmPasswordRules"
                :append-inner-icon="showConfirmPassword ? 'mdi-eye' : 'mdi-eye-off'" autocomplete="new-password"
                required @click:append-inner="showConfirmPassword = !showConfirmPassword" />
            </div>

            <!-- Password Strength Indicator -->
            <div v-if="form.newPassword" class="mt-4">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm text-gray-600">パスワード強度</span>
                <span class="text-sm" :class="passwordStrengthColor">
                  {{ passwordStrengthText }}
                </span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-2">
                <div class="h-2 rounded-full transition-all duration-300" :class="passwordStrengthBarColor"
                  :style="{ width: `${passwordStrengthPercent}%` }" />
              </div>
            </div>

            <!-- Requirements -->
            <div class="mt-4 p-3 bg-gray-50 rounded-lg">
              <p class="text-sm font-medium text-gray-700 mb-2">パスワード要件:</p>
              <ul class="text-sm text-gray-600 space-y-1">
                <li class="flex items-center">
                  <Icon :name="form.newPassword.length >= 8 ? 'mdi:check-circle' : 'mdi:circle-outline'"
                    :class="form.newPassword.length >= 8 ? 'text-green-500' : 'text-gray-400'" class="mr-2" />
                  8文字以上
                </li>
                <li class="flex items-center">
                  <Icon :name="/(?=.*[a-z])/.test(form.newPassword) ? 'mdi:check-circle' : 'mdi:circle-outline'"
                    :class="/(?=.*[a-z])/.test(form.newPassword) ? 'text-green-500' : 'text-gray-400'" class="mr-2" />
                  小文字を含む
                </li>
                <li class="flex items-center">
                  <Icon :name="/(?=.*\d)/.test(form.newPassword) ? 'mdi:check-circle' : 'mdi:circle-outline'"
                    :class="/(?=.*\d)/.test(form.newPassword) ? 'text-green-500' : 'text-gray-400'" class="mr-2" />
                  数字を含む
                </li>
              </ul>
            </div>

            <div class="flex items-center justify-between pt-6">
              <v-btn variant="outlined" to="/profile">
                キャンセル
              </v-btn>
              <v-btn color="primary" :loading="loading" @click="changePassword">
                パスワードを変更
              </v-btn>
            </div>
          </v-form>
        </v-card-text>
      </v-card>

      <!-- Security Tips -->
      <v-card class="mt-6 bg-blue-50 border border-blue-200" variant="outlined">
        <v-card-text class="p-4">
          <div class="flex items-center mb-2">
            <Icon name="mdi:shield-check" class="text-blue-500 mr-2" />
            <span class="font-medium text-blue-700">セキュリティのヒント</span>
          </div>
          <ul class="text-sm text-blue-600 space-y-1 ml-6">
            <li>• 他のサービスで使用していないパスワードを設定してください</li>
            <li>• 定期的（3〜6ヶ月毎）にパスワードを変更してください</li>
            <li>• 推測されやすい個人情報は使用しないでください</li>
          </ul>
        </v-card-text>
      </v-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChangePasswordRequest } from '~/types'

const logger = useLogger({ prefix: '[PAGE-CHANGE-PASSWORD]' })
const apiClient = useApiClient()

definePageMeta({
  middleware: 'auth'
})

useHead({
  title: 'パスワード変更 - M・S CFD App'
})

const { showSuccess, showError } = useNotification()

// State
const loading = ref(false)
const showCurrentPassword = ref(false)
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)
const formRef = ref()

const form = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})

// Validation rules
const currentPasswordRules = [
  (v: string) => !!v || '現在のパスワードは必須です'
]

const newPasswordRules = [
  (v: string) => !!v || '新しいパスワードは必須です',
  (v: string) => v.length >= 8 || 'パスワードは8文字以上で入力してください',
  (v: string) => /(?=.*[a-z])/.test(v) || 'パスワードに小文字を含めてください',
  (v: string) => /(?=.*\d)/.test(v) || 'パスワードに数字を含めてください',
  (v: string) => v !== form.currentPassword || '新しいパスワードは現在のパスワードと異なる必要があります'
]

const confirmPasswordRules = [
  (v: string) => !!v || 'パスワード確認は必須です',
  (v: string) => v === form.newPassword || 'パスワードが一致しません'
]

// Computed - Password Strength
const passwordStrengthScore = computed(() => {
  const password = form.newPassword
  if (!password) return 0

  let score = 0

  // Length
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1

  // Character types
  if (/[a-z]/.test(password)) score += 1
  if (/[A-Z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^a-zA-Z\d]/.test(password)) score += 1

  return score
})

const passwordStrengthPercent = computed(() => {
  return Math.min((passwordStrengthScore.value / 6) * 100, 100)
})

const passwordStrengthText = computed(() => {
  const score = passwordStrengthScore.value
  if (score <= 2) return '弱い'
  if (score <= 4) return '普通'
  return '強い'
})

const passwordStrengthColor = computed(() => {
  const score = passwordStrengthScore.value
  if (score <= 2) return 'text-red-600'
  if (score <= 4) return 'text-yellow-600'
  return 'text-green-600'
})

const passwordStrengthBarColor = computed(() => {
  const score = passwordStrengthScore.value
  if (score <= 2) return 'bg-red-500'
  if (score <= 4) return 'bg-yellow-500'
  return 'bg-green-500'
})

// Methods
const changePassword = async () => {
  const { valid } = await formRef.value.validate()
  if (!valid) return

  loading.value = true

  try {
    const requestData: ChangePasswordRequest = {
      currentPassword: form.currentPassword,
      newPassword: form.newPassword
    }

    const response = await apiClient.post<Record<string, unknown>>('/auth/change-password', requestData)

    const rawResponse = response as Record<string, unknown>
    if (
      rawResponse?.error ||
      (typeof rawResponse?.statusCode === 'number' && rawResponse.statusCode >= 400) ||
      (typeof rawResponse?.status === 'number' && rawResponse.status >= 400) ||
      (rawResponse?.data && typeof (rawResponse.data as Record<string, unknown>)?.statusCode === 'number' && (rawResponse.data as Record<string, unknown>).statusCode as number >= 400) ||
      (rawResponse?.data && typeof (rawResponse.data as Record<string, unknown>)?.status === 'number' && (rawResponse.data as Record<string, unknown>).status as number >= 400)
    ) {
      throw rawResponse?.error || rawResponse?.data || rawResponse
    }

    showSuccess('パスワードを変更しました')

    // Reset form
    form.currentPassword = ''
    form.newPassword = ''
    form.confirmPassword = ''
    formRef.value?.resetValidation()

    // Redirect to profile
    await navigateTo('/profile')
  } catch (error: unknown) {
    logger.error('パスワードの変更に失敗しました:', error)

    if (error && typeof error === 'object') {
      // サーバーエラーレスポンスのパース
      const err = error as { data?: unknown, response?: { _data?: unknown } }
      const errorData = (err.data || err.response?._data || err) as { statusMessage?: unknown, message?: unknown }
      const statusMessage = typeof errorData.statusMessage === 'string'
        ? errorData.statusMessage
        : (typeof errorData.message === 'string' ? errorData.message : '')

      if (statusMessage === 'Current password is incorrect') {
        showError('現在のパスワードが正しくありません')
      } else if (statusMessage === 'New password must be different from current password') {
        showError('新しいパスワードは現在のパスワードと異なる必要があります')
      } else if (statusMessage === 'Current password and new password are required') {
        showError('パスワードを入力してください')
      } else if (statusMessage === 'Session not found' || statusMessage === 'Access token not found') {
        showError('セッションが切れました。再度ログインしてください')
      } else if (statusMessage.includes('password does not meet requirements') ||
        statusMessage.includes('least 8 characters long') ||
        statusMessage.includes('lowercase letter') ||
        statusMessage.includes('one number')) {
        showError('新しいパスワードが要件を満たしていません')
      } else {
        showError('パスワードの変更に失敗しました')
      }
    } else {
      showError('パスワードの変更に失敗しました')
    }
  } finally {
    loading.value = false
  }
}
</script>