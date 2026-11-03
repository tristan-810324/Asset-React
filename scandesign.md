# Barcode Label Print Design

This document describes the current 50 × 30 mm thermal label used by the GSO issuance flow, its barcode payload, and the Windows print settings for the CLabel-CT221B. The current implementation is in [mainissuance.tsx](frontend/src/gso/mainissuance.tsx), with an exact source snapshot in [mainissuance.tsx.backup](frontend/src/gso/mainissuance.tsx.backup).

## Label layout

- **Media:** 50 mm wide × 30 mm high, landscape, one asset label per page.
- **Print page:** `@page { size: 50mm 30mm; margin: 0; }`.
- **Label box:** 50 × 30 mm, with 0.5 mm side padding and a 0.3 mm top inset.
- **Barcode:** black Code 128 bars on white; generated at 64 px high for the print label, fitted within 49 mm width and capped at 19 mm height.
- **Readable asset tag:** the complete `AST-...` value, centered below the barcode in 4 mm bold type.
- **Property reminder:** `PROPERTY OF DYCI-DO NOT REMOVE`, centered below the tag in 2 mm bold type.
- **Item identification:** `[item name] - [item code]` on the final line in 1.7 mm bold type. Long item names are ellipsized within 32 mm so the item code remains visible.
- **Spacing:** 0.2 mm between content rows. The item line uses the remaining space within the existing 30 mm page; the page size and barcode/tag dimensions remain fixed.
- **Print appearance:** no border or decorative background; keep the bars and text black against white for contrast.

The preview and the print portal use the same label content and physical dimensions.

## Barcode data and scanner behavior

The full asset tag remains printed as readable text. For the supported `AST-` tag formats (13 alphanumeric characters or 20 hexadecimal characters after the prefix), the barcode encodes only the suffix to make the bars shorter. Other tag formats are encoded as provided. The GSO return scanner restores the `AST-` prefix for compact suffixes before looking up the asset.

The relevant scanner compatibility code is in [returnitems.tsx](frontend/src/gso/returnitems.tsx) and [issuancesApi.ts](frontend/src/gso/issuancesApi.ts).

## Windows print settings

In the browser print dialog for the CLabel-CT221B, use:

1. **Paper size:** `50*30` (the media configured for the label roll in the Windows printer driver)
2. **Layout:** Landscape
3. **Scale:** Actual size (100%)
4. **Margins:** None
5. **Pages per sheet:** 1
6. **Headers and footers:** Off
7. **Copies:** 1
8. **Color:** Black and white

The page dimensions come from the app's print CSS, while the selected roll/media comes from the Windows printer driver. If the preview shows a different paper size such as `40*30` or `40*60`, select `50*30` in the dialog/driver and review the preview again before printing. Do not use Fit to printable area because it can change the physical label scale.

## Backup and restore

[mainissuance.tsx.backup](frontend/src/gso/mainissuance.tsx.backup) is the consolidated backup of the current source, including the item name and item code line. To restore it from the project root in PowerShell:

```powershell
Copy-Item -LiteralPath 'frontend/src/gso/mainissuance.tsx.backup' -Destination 'frontend/src/gso/mainissuance.tsx' -Force
```

To refresh the backup after an accepted change to the source:

```powershell
Copy-Item -LiteralPath 'frontend/src/gso/mainissuance.tsx' -Destination 'frontend/src/gso/mainissuance.tsx.backup' -Force
```
