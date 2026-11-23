# curió

Site da curió, plataforma brasileira de aprendizado de design: *design que se aprende na troca*.

- `index.html`: o site (HTML, CSS e JS num arquivo só), com navegação por hash (`#sobre`, `#artigos`, `#artigo-<slug>`…).
- `admin.html` + `admin/`: o editor de artigos, em `/admin`.
- `curio-render.js` + `curio-article.css`: transformam o JSON de um artigo em HTML seguro. São usados pelo site e pelo admin.
- `config.js`: endereço e chave pública do Supabase.
- `supabase/schema.sql`: tabelas, regras de acesso e bucket de imagens.

## Como os artigos funcionam

O admin salva cada artigo no Supabase com o corpo em **JSON estruturado** (o documento do editor TipTap/ProseMirror), nunca em HTML. Isso permite:

- montar o HTML com segurança, já que só os blocos conhecidos viram HTML e todo texto é escapado;
- reaproveitar o mesmo conteúdo num app no futuro;
- calcular o tempo de leitura automaticamente (palavras ÷ 200, arredondado para cima).

O site busca os artigos com `status = 'published'` e mostra esses primeiro, antes dos três artigos fixos do código.

## Configurar o Supabase (uma vez)

1. Crie um projeto em https://supabase.com.
2. Em **SQL Editor**, rode o arquivo `supabase/schema.sql` inteiro.
3. Em **Authentication → Users → Add user**, crie sua conta com e-mail e senha.
4. Volte ao **SQL Editor** e rode a última linha do `schema.sql`, trocando pelo seu e-mail:
   `insert into public.admins (user_id) select id from auth.users where email = 'seu-email@exemplo.com';`
5. Em **Project Settings → API**, copie a *Project URL* e a chave *anon public* para o `config.js`.
6. Em **Authentication → URL Configuration**, coloque o endereço do site da Vercel em *Site URL*.

Sem o `config.js` preenchido, o site mostra só os artigos fixos e o admin roda em **modo demonstração**: tudo fica salvo só no navegador.

## Editor (`/admin`)

- Modo zen, com coluna de 700px, título e subtítulo fixos e salvamento automático 1,5 s depois de parar de digitar.
- Ao selecionar um trecho de texto, aparece uma barra com negrito, itálico, link, título grande (H2), título pequeno (H3) e citação de destaque.
- Numa linha vazia, aparece o botão **+**, que insere imagem, vídeo (YouTube, Vimeo), embed (X, Instagram, Gist, CodePen, Spotify ou link) e divisor.
- Imagem: envio do computador, arrastar e soltar, ou Ctrl+V. Também tem layout normal, expandido ou tela cheia, legenda e texto alternativo.
- **Publicar** abre a prévia do card. Nela você escolhe a capa e o ponto focal, ajusta o título e o subtítulo de exibição e adiciona até 3 tags.

## Desenvolvimento

O admin é compilado para `admin/admin.js`, que vai no repositório, então a Vercel não precisa rodar build.

```bash
npm install
npm run build:admin
python3 -m http.server 8000   # http://localhost:8000 e http://localhost:8000/admin.html
```

## Deploy

Vercel, preset **Other**, sem comando de build e com a raiz do repositório como pasta de saída. O `vercel.json` liga `cleanUrls`, então o admin abre em `/admin`.
