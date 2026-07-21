/**
 * Fontes 100% locais (bundladas pelo Vite, sem CDN externo).
 *
 * Antes disso, index.html carregava Inter/JetBrains Mono/Geist/Material
 * Symbols via Google Fonts em runtime — se o CDN estivesse lento, bloqueado
 * ou fora do ar, os ícones (que são texto convertido em glifo via ligadura
 * da fonte) apareciam como texto cru sobrepondo os labels ao lado. Com as
 * fontes empacotadas localmente, a UI nunca depende de rede para renderizar
 * corretamente — consistente com o princípio "motor/produto local" do
 * projeto.
 */
// Só os subsets latin/latin-ext (cobre PT-BR e EN, incluindo acentos) — os
// pacotes @fontsource numerados (ex. "400.css") trazem TODOS os idiomas
// (cirílico, grego, vietnamita...), inflando o bundle sem necessidade.
import '@fontsource/inter/latin.css';
import '@fontsource/inter/latin-ext.css';
import '@fontsource/jetbrains-mono/latin.css';
import '@fontsource/jetbrains-mono/latin-ext.css';
import '@fontsource/geist-sans/latin.css';
import 'material-symbols/outlined.css';
