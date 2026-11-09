# Caderno de Cozinha

Caderno pessoal de receitas e técnicas: sushi e sashimi, churrasco, fundos e molhos clássicos, bolos e doces. Site estático, sem dependências, com busca, categorias, porções ajustáveis, timers nos passos, fotos e uma aba de vídeos salvos.

## Ver o site

- Abra `index.html` no navegador (funciona com dois cliques), ou
- rode `npm run serve` e acesse http://localhost:3000.

## Adicionar ou editar uma receita

1. Crie ou edite um arquivo em `recipes/` (veja o formato em `CLAUDE.md`). Fotos vão em `images/<nome-da-receita>/`.
2. Rode `npm run build`. Ele valida tudo e atualiza `data/caderno.js`.
3. Faça o commit.

Ou peça ao Claude Code: "adicione esta receita: …". O `CLAUDE.md` explica para ele como o projeto funciona.

## Estrutura

| Pasta/arquivo | O que é |
|---|---|
| `recipes/` | uma receita por arquivo JSON |
| `videos/` | vídeos salvos |
| `images/` | fotos e esquemas, uma pasta por receita |
| `scripts/build.mjs` | valida e gera `data/caderno.js` |
| `data/caderno.js` | gerado, não editar à mão |
| `index.html`, `assets/` | o site |

## Publicar no GitHub Pages

Settings → Pages → Deploy from a branch → `main`, pasta `/ (root)`. No plano gratuito do GitHub, o Pages exige repositório público.
