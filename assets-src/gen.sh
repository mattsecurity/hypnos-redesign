#!/bin/zsh
# usage: gen.sh <name> [input-image]
ROOT="/Users/matteosicurezza/Desktop/Progetti/Siti Web/Hypnos Srl/hypnos-redesign"
NAME=$1; IN=$2
OUT="$ROOT/assets-src/$NAME.png"
P="$(cat "$ROOT/assets-src/prompts/$NAME.txt")"
FULL="Usa il tuo strumento integrato di generazione immagini (image_gen) per creare questa immagine. Non usare script Python, API o disegno programmatico: usa solo lo strumento immagini. Massimo fotorealismo.

$P

Poi copia il PNG generato esattamente in $OUT . Alla fine conferma il percorso."
if [ -n "$IN" ]; then
  echo "$FULL" | codex exec --skip-git-repo-check -s workspace-write -C "$ROOT" -i "$IN" - > "$ROOT/assets-src/$NAME.log" 2>&1
else
  codex exec --skip-git-repo-check -s workspace-write -C "$ROOT" "$FULL" </dev/null > "$ROOT/assets-src/$NAME.log" 2>&1
fi
ls -la "$OUT" && file "$OUT"
