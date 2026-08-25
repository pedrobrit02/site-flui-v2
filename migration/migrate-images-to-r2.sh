#!/usr/bin/env bash
# Migra as imagens do FLUI do Supabase Storage para o bucket R2 do Cloudflare.
#
# Rode este script de dentro da pasta raiz do projeto (Flui-main), depois de
# já ter feito "npx wrangler@3 login" (o mesmo login usado para o D1).
#
# O que ele faz:
#   1. Cria o bucket R2 "flui-assets" (ignora erro se já existir).
#   2. Para cada imagem usada no site: usa a cópia que já existe em ./assets
#      quando existe, ou baixa do Supabase Storage quando não existe localmente
#      (é o caso das fotos da equipe, que só estão no Supabase).
#   3. Envia cada imagem para o bucket R2, com o Content-Type correto.
#
# Depois de rodar isto e fazer "npx wrangler@3 deploy" (de dentro de worker/),
# as imagens passam a ser servidas por:
#   https://flui-api.pedro-brito-flui.workers.dev/assets/<nome-do-arquivo>
# em vez do Supabase Storage — então o site para de depender do Supabase
# por completo (banco de dados E fotos).

set -euo pipefail

SUPABASE_STORAGE_URL="https://mvpumfqkjaybssiffkqb.supabase.co/storage/v1/object/public/assets"
BUCKET="flui-assets"
LOCAL_ASSETS_DIR="./assets"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "==> Criando bucket R2 '$BUCKET' (ok se já existir)..."
npx wrangler@3 r2 bucket create "$BUCKET" || true
echo

# nome-do-arquivo:content-type
IMAGES=(
  "cortealaser.jpeg:image/jpeg"
  "impressora3D.jpeg:image/jpeg"
  "impressora.jpeg:image/jpeg"
  "plotter.jpeg:image/jpeg"
  "suporteaprojetos.jpeg:image/jpeg"
  "logo-flui.png:image/png"
  "placeholder.jpeg:image/jpeg"
  "Carlos.jpg:image/jpeg"
  "Luciana.jpg:image/jpeg"
  "Robert.jpeg:image/jpeg"
  "Mateus.jpg:image/jpeg"
  "Edson.jpeg:image/jpeg"
  "Bruna.jpeg:image/jpeg"
  "Eduarda.jpeg:image/jpeg"
  "Kayky.jpeg:image/jpeg"
  "Pedro.jpeg:image/jpeg"
)

FAIL=0

for entry in "${IMAGES[@]}"; do
  name="${entry%%:*}"
  ctype="${entry##*:}"
  local_path="$LOCAL_ASSETS_DIR/$name"

  if [ -f "$local_path" ]; then
    src="$local_path"
    echo "==> $name (cópia local em ./assets)"
  else
    src="$TMP_DIR/$name"
    echo "==> $name (baixando do Supabase Storage)..."
    if ! curl -sSf "$SUPABASE_STORAGE_URL/$name" -o "$src"; then
      echo "    AVISO: não consegui baixar $name do Supabase. Pulando."
      FAIL=1
      continue
    fi
  fi

  npx wrangler@3 r2 object put "$BUCKET/$name" --file="$src" --content-type="$ctype"
  echo
done

if [ "$FAIL" -eq 1 ]; then
  echo "==> Concluído com avisos: alguma imagem não foi encontrada no Supabase (veja acima)."
else
  echo "==> Concluído! Todas as imagens estão no bucket R2 '$BUCKET'."
fi
echo "    Agora rode, de dentro da pasta worker/:"
echo "      npx wrangler@3 deploy"
echo "    para publicar a rota /assets/* que serve essas imagens."
