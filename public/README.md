# Public Assets Directory

This directory contains static assets that are served at the root URL path.

## Logo File

To add your company logo to the header:

1. Place your logo file in this directory (`public/`)
2. Name it one of the following:
   - `logo.png`
   - `logo.svg`
   - `logo.jpg`
   - `logo.webp`

3. Update the `logoSrc` variable in `src/app/components/Header.tsx` if your logo has a different filename.

The logo will automatically appear in the header on both the intake and results pages. If the logo file is not found, the header will display "Boyd Group Services" as text.

## Recommended Logo Specifications

- **Format**: PNG or SVG (SVG recommended for scalability)
- **Height**: Approximately 40px (will be scaled proportionally)
- **Width**: Flexible, but recommended max width of 200px
- **Background**: Transparent or white background recommended
