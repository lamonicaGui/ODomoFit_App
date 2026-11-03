/**
 * Serviço Oficial de Autenticação Google Identity Services (GIS)
 * O Domo FIT
 */

export interface GoogleUserProfile {
  googleId: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  role: 'student' | 'trainer';
}

const GOOGLE_CLIENT_ID = '919755883453-g3cq4a0olnh1ovfcnb9tvct7pp22ipnt.apps.googleusercontent.com';

declare global {
  interface Window {
    google?: any;
  }
}

/**
 * Garante que o script do Google Identity Services esteja carregado no DOM
 */
export function ensureGoogleScriptLoaded(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.google?.accounts?.oauth2) {
      resolve(true);
      return;
    }

    const existingScript = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(true));
      setTimeout(() => resolve(!!window.google?.accounts?.oauth2), 1500);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

/**
 * Abre a janela oficial do Google para escolha de conta e login
 */
export async function triggerGoogleOAuthPopup(
  role: 'student' | 'trainer',
  onSuccess: (profile: GoogleUserProfile) => void,
  onError: (errorMessage: string) => void
): Promise<void> {
  const isLoaded = await ensureGoogleScriptLoaded();

  if (!isLoaded || !window.google?.accounts?.oauth2) {
    onError('O serviço do Google está carregando ou foi bloqueado pelo navegador. Tente novamente.');
    return;
  }

  try {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'email profile openid',
      prompt: 'select_account',
      callback: async (tokenResponse: any) => {
        if (tokenResponse?.error) {
          console.error('Google Auth callback error:', tokenResponse);
          onError(`Erro na autenticação do Google: ${tokenResponse.error_description || tokenResponse.error}`);
          return;
        }

        if (tokenResponse?.access_token) {
          try {
            // Busca os dados reais do perfil diretamente da API oficial do Google
            const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
            });

            if (!userInfoRes.ok) {
              throw new Error('Falha ao obter perfil do usuário no Google');
            }

            const data = await userInfoRes.json();

            const profile: GoogleUserProfile = {
              googleId: data.sub || `google-${Date.now()}`,
              email: data.email,
              fullName: data.name || data.given_name || 'Usuário Google',
              avatarUrl: data.picture,
              role,
            };

            onSuccess(profile);
          } catch (err: any) {
            console.error('Erro ao buscar dados do usuário Google:', err);
            onError('Não foi possível obter os dados da conta Google. Verifique sua conexão.');
          }
        }
      },
      error_callback: (nonOAuthError: any) => {
        console.warn('Google TokenClient error:', nonOAuthError);
        onError('Janela de login do Google fechada ou não autorizada.');
      },
    });

    tokenClient.requestAccessToken({ prompt: 'select_account' });
  } catch (err: any) {
    console.error('Erro ao inicializar Google TokenClient:', err);
    onError('Erro ao abrir o seletor de contas do Google. Tente novamente.');
  }
}
