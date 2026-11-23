# curió

Site da curió, plataforma brasileira de aprendizado de design: *design que se aprende na troca*.

Página estática, sem build: tudo está em `index.html` (HTML, CSS e JavaScript), com navegação por hash (`#sobre`, `#artigos`, `#contato`, `#design-comportamental`…).

## Rodar localmente

Abra `index.html` no navegador, ou sirva a pasta:

```bash
npx serve .
```

## Deploy

Na Vercel, importe este repositório como projeto. Não há comando de build nem pasta de saída: o framework preset é "Other" e a raiz do projeto é a raiz do repositório.
