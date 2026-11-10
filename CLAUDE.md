# Caderno de Cozinha: contexto para o Claude

Caderno pessoal de receitas e técnicas de cozinha do dono deste repositório. Ele é brasileiro, mora em Sydney (Austrália), cozinha em casa e está aprendendo sushi e sashimi, churrasco, fundos e molhos clássicos. Tudo é escrito em **português do Brasil**.

O projeto começou como um artifact no claude.ai e foi migrado para cá em novembro de 2026 para ter versões (git). Cada mudança deve virar um commit com mensagem clara em português.

## Como o projeto funciona

Site estático, sem framework e sem dependências. As receitas são arquivos JSON; um script junta tudo num arquivo que o site carrega.

```
recipes/<slug>.json   uma receita por arquivo (fonte da verdade)
videos/<id>.json      vídeos salvos (links do YouTube etc.)
images/<slug>/NN.jpg  fotos e esquemas de cada receita (01 = capa)
scripts/build.mjs     valida tudo e gera data/caderno.js
data/caderno.js       GERADO: não editar à mão
index.html            página
assets/app.js         lógica do site (índice, receita, porções, timers, vídeos)
assets/style.css      visual (tokens de cor em :root, tema claro e escuro)
```

Depois de qualquer mudança em `recipes/` ou `videos/`, rode `npm run build` (ou `node scripts/build.mjs`). Ele recusa o build e lista os erros se algo estiver inválido. Commite também o `data/caderno.js` gerado, para o site funcionar direto (inclusive abrindo o `index.html` com dois cliques, sem servidor).

Para ver localmente: abra `index.html` no navegador, ou rode `npm run serve` e acesse http://localhost:3000.

## Formato de uma receita (`recipes/<slug>.json`)

```json
{
  "title": "Molho bechamel",
  "category": "Molhos",
  "description": "Uma ou duas frases que aparecem no cartão do índice.",
  "servings": 1,
  "yieldLabel": "receita (~400 ml)",
  "scale": true,
  "ingredients": [
    { "id": "1", "name": "manteiga", "amount": 16, "unit": "g" },
    { "id": "2", "name": "## Cebola piquée", "amount": "", "unit": "" },
    { "id": "3", "name": "folha de louro", "amount": 1, "unit": "" },
    { "id": "4", "name": "sal a gosto", "amount": "", "unit": "" }
  ],
  "steps": [
    { "title": "Fazer o roux", "content": "Derreta {1} em fogo baixo…", "timer": 90 }
  ],
  "notes": "Dicas, variações, substituições, o que foi suposto.",
  "images": [ { "src": "images/molho-bechamel/01.jpg", "caption": "Legenda." } ],
  "source": "arquivo ou origem, se houver",
  "updatedAt": "2026-11-09T03:05:00.000Z"
}
```

Regras:
- **Nome do arquivo** = slug: minúsculas, sem acento, palavras separadas por hífen (`bolo-de-cenoura.json`). O slug também é o endereço da receita no site (`#r-bolo-de-cenoura`).
- **Unidades** aceitas em `unit`: `g`, `kg`, `ml`, `l`, `tsp` (colher de chá), `tbsp` (colher de sopa), `cup` (xícara, 240 ml), `pinch` (pitada) ou `""` (unidade/contagem). Medidas que não cabem aí (lata, maço, dente, copo americano, colher de café) vão no nome com `unit: ""`, por exemplo `amount: 2, name: "latas de milho-verde"`.
- **Frações** são números decimais (`0.5`, `0.333`, `0.25`); o site mostra ½, ⅓, ¼ para xícara e colheres.
- **"A gosto"**: `amount: ""` e escreva no nome ("sal a gosto").
- **Grupos de ingredientes**: uma linha com `name` começando por `## ` vira subtítulo (ex.: `## Cobertura`). Tem `id` próprio mas nunca é citada nos passos.
- **Citar ingrediente no passo**: `{id}` dentro de `content` mostra a quantidade já ajustada às porções e o nome. O build acusa referências quebradas.
- **Timer**: em **segundos** (`900` = 15 min). Só em passos com espera ou cozimento cronometrado; `0` ou ausente = sem timer.
- **Porções**: `servings` é o rendimento base e `yieldLabel` a unidade ("porções", "peças", "fatias", "coxinhas", "receita (~1 l)"). `scale: false` esconde o seletor (técnicas, receitas sem rendimento claro).
- **Imagens**: em `images/<slug>/`, numeradas `01`, `02`…; a primeira é a capa do cartão. Prefira JPG com no máximo ~1600 px no lado maior.
- `draft: true` (opcional) esconde a receita do site sem apagar o arquivo.

Vídeos (`videos/<id>.json`): `{ "url", "title", "category", "note", "addedAt" }`. Para YouTube, use `yt-<código do vídeo>` como id. O site não embute o player: mostra um cartão com link.

## Categorias em uso

Bolos, Caldos, Churrasco, Doces, Embutidos, Frituras, Fundos, Molhos, Peixe cru, Pratos, Salgados, Sushi, Técnicas, Temperos. Fundos (fundo claro, escuro, fumet) ficam separados de Molhos de propósito. Reaproveite uma categoria existente antes de criar outra.

## Como escrever e completar receitas

O dono costuma mandar receitas incompletas ou em anotação rápida (ex.: "16g farinha, 16g manteiga, 400ml leite, cebola piquée, noz-moscada") e pede para completar. Ao fazer isso:
- Preserve as quantidades e a intenção dele. Complete o que falta (sal, tempo, temperatura, rendimento, técnica clássica) com o padrão da cozinha profissional.
- **Registre nas `notes` tudo o que foi suposto ou interpretado** (ex.: "a receita original não dizia temperatura; usei 180 °C por 40 minutos").
- Passos curtos, no imperativo, um por ação, com título de 2–4 palavras.
- Explique o porquê quando ajuda a acertar (ex.: "não deixe o kombu ferver: amarga").
- Segurança alimentar em peixe cru, ovo cru e carnes: avise nas notas, sem alarmismo.
- Ele mora na Austrália: quando um ingrediente brasileiro tiver nome diferente lá, diga o equivalente (ex.: lata de creme de leite = Nestlé Reduced Cream; cornflour = amido de milho).
- Mostre a receita para aprovação antes de commitar quando ele pedir; quando ele mandar "adicione", pode adicionar direto.

## Antes de mudar o site: mockup primeiro

Para qualquer ajuste visual ou funcionalidade nova, **mostre antes um mockup** (estilo Figma, telas de celular na paleta do site) e só altere o código depois que ele aprovar. Receitas novas não precisam de mockup.

## Contas e comunidade (em andamento)

O site tem página inicial para quem não está logado, login (Google, e-mail com código de 6 dígitos; Apple depois) e três abas: **Minhas receitas**, **Descubra** (receitas públicas da comunidade) e **Vídeos**. Toda receita nasce privada; o dono publica quando quiser.

```
assets/config.js      URL e chave pública (anon) do Supabase; vazio = modo demonstração
assets/store.js       dados: Supabase ou demonstração (login simulado, nada é salvo)
supabase/schema.sql   tabelas profiles, recipes (conteúdo em jsonb "data"), recipe_likes, view recipe_feed, RLS
```

Nunca coloque a chave `service_role` nem senhas no repositório. Login é só por e-mail (não por @), para não expor o e-mail de ninguém.

## Visual

Paleta de "balcão de peixaria": gelo azulado e acento laranja-salmão, com tema claro e escuro (tokens em `:root` de `assets/style.css`). Fontes: Shippori Mincho (títulos), Zen Kaku Gothic New (texto), IBM Plex Mono (números e rótulos). Mantenha esse estilo ao criar telas novas. O site precisa funcionar bem no celular (ele consulta na cozinha).

## Publicar

GitHub Pages serve o site direto da branch principal (Settings → Pages → Deploy from a branch → `main` / root). Pages em repositório privado exige plano pago do GitHub; no plano gratuito, o repositório precisa ser público para isso.

## Pendências e ideias

- Os 2 vídeos em `videos/` estão sem título (só o código do YouTube). Peça a ele o assunto de cada um.
- Ideias que já surgiram: lista de compras a partir das receitas, cronômetro de preparo de jantar de sushi, impressão de receita.
