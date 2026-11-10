// Configuração do Caderno de Cozinha.
// Os dois valores do Supabase são públicos (podem ficar no site): Project Settings → API.
// NUNCA coloque aqui a chave service_role nem senhas.
// Enquanto supabaseUrl ou supabaseAnonKey estiverem vazios, o site roda em "modo demonstração":
// o login é simulado e nada é salvo.
window.CADERNO_CONFIG = {
  supabaseUrl: 'https://byyhocwvccrxdhngblrq.supabase.co',
  supabaseAnonKey: 'sb_publishable_26VAdpKj5wTLP5EkuOe6og_UEDleQXt',
  // id (uuid) da conta do dono: só ela vê o botão de importar as receitas de recipes/.
  ownerId: '89a1b4cc-5776-4b05-bf36-ec2d9297c0e0',
  // Login por e-mail (código de 6 dígitos) exige SMTP próprio no Supabase (Authentication → SMTP Settings)
  // e {{ .Token }} no modelo "Magic Link". Sem isso o Supabase só envia para membros do projeto, 2 por hora.
  emailEnabled: false,
  // Login com Apple exige conta Apple Developer; ligue quando estiver configurado no Supabase.
  appleEnabled: false,
  // Nome mostrado como autor das receitas de recipes/ no modo demonstração.
  demoAuthor: 'jhonas'
};
