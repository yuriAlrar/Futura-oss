<template>
  <div>
    <div class="text-center mb-6">
      <h2 class="text-xl font-semibold text-gray-900">新規登録</h2>
    </div>

    <div v-if="checkingInvite" class="text-center py-8">
      <v-progress-circular indeterminate color="primary" />
      <p class="text-gray-600 mt-4">招待コードを確認中...</p>
    </div>

    <div v-else-if="!inviteValid" class="text-center py-8">
      <Icon name="mdi:link-off" class="text-4xl text-red-400 mb-2" />
      <p class="text-gray-700 font-medium">招待リンクが無効です</p>
      <p class="text-sm text-gray-500 mt-2">招待リンクが失効しているか、既に使用されています。発行元にお問い合わせください。</p>
    </div>

    <div v-else-if="registered" class="text-center py-8">
      <Icon name="mdi:check-circle" class="text-4xl text-green-500 mb-2" />
      <p class="text-gray-700 font-medium">登録が完了しました</p>
      <p class="text-sm text-gray-500 mt-2">管理者による承認後、すべての機能がご利用いただけます。ログインしてご利用ください。</p>
      <v-btn color="primary" class="mt-4" to="/login">
        ログインへ
      </v-btn>
    </div>

    <v-form v-else ref="formRef" @submit.prevent="submit">
      <div class="space-y-4">
        <v-text-field v-model="form.email" label="メールアドレス *" type="email" variant="outlined" :rules="emailRules"
          required />
        <v-text-field v-model="form.name" label="氏名 *" variant="outlined" :rules="nameRules" required />
        <v-text-field v-model="form.phone_number" label="電話番号 *" variant="outlined" :rules="phoneRules" required />

        <CommonPasswordField v-model="form.password" label="パスワード *" :rules="passwordRules" confirm
          autocomplete="new-password" hint="8文字以上、小文字と数字を含めてください" />

        <v-btn type="submit" color="primary" block size="large" :loading="loading">
          登録する
        </v-btn>
      </div>
    </v-form>
  </div>
</template>

<script setup lang="ts">
import type { PublicRegisterForm } from '~/types'

definePageMeta({
  layout: 'auth'
})

useHead({
  title: '新規登録 - M・S CFD App'
})

const route = useRoute()
const apiClient = useApiClient()
const logger = useLogger({ prefix: '[PAGE-REGISTER]' })
const { showError } = useNotification()

const inviteCode = String(route.query.code || '')

const checkingInvite = ref(true)
const inviteValid = ref(false)
const registered = ref(false)
const loading = ref(false)
const formRef = ref<any>(null)

// 住所はこの時点では収集しない（プロフィール画面で後から入力する想定）
const form = reactive<PublicRegisterForm>({
  invite_code: inviteCode,
  email: '',
  name: '',
  phone_number: '',
  password: ''
})

const emailRules = [
  (v: string) => !!v || 'メールアドレスは必須です',
  (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || '有効なメールアドレスを入力してください'
]

const nameRules = [
  (v: string) => !!v || '氏名は必須です'
]

const phoneRules = [
  (v: string) => !!v || '電話番号は必須です'
]

const passwordRules = [
  (v: string) => !!v || 'パスワードは必須です',
  (v: string) => v.length >= 8 || 'パスワードは8文字以上で入力してください',
  (v: string) => /[a-z]/.test(v) || '小文字を含めてください',
  (v: string) => /[0-9]/.test(v) || '数字を含めてください'
]

const checkInvite = async () => {
  if (!inviteCode) {
    checkingInvite.value = false
    inviteValid.value = false
    return
  }

  checkingInvite.value = true
  try {
    const response = await apiClient.get<{ valid: boolean }>(`/public/invites/${encodeURIComponent(inviteCode)}`)
    inviteValid.value = response.success && !!response.data?.valid
  } catch (error) {
    logger.error('招待コード確認エラー:', error)
    inviteValid.value = false
  } finally {
    checkingInvite.value = false
  }
}

const submit = async () => {
  const { valid } = await formRef.value.validate()
  if (!valid) return

  loading.value = true
  try {
    const response = await apiClient.post('/public/register', form)

    if (!response.success) {
      showError(response.error || '登録に失敗しました')
      return
    }

    registered.value = true
  } catch (error: unknown) {
    logger.error('登録エラー:', error)
    showError('登録に失敗しました')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  checkInvite()
})
</script>
