# Barcode Label at Asset Tracking

## Napag-usapan

Gagamit ang bawat physical unit ng sarili nitong unique barcode label. Kapag na-scan ang label, hahanapin ng system ang item at kaugnay na staff/issuance record. Sa pagbalik ng gamit, susuriin muna ng GSO ang item at pipiliin ang kondisyon nito; saka ito iruruta ng system sa tamang destination.

## Kasalukuyang nasa system

- Sa [Main Issuance](frontend/src/gso/mainissuance.tsx#L737), gumagawa ang system ng unique Code 128 barcode kada unit kapag naaprubahan ang issuance. Nasa label ang item code, item name, at barcode/tag code.
- Browser print ang gamit ngayon. Ang print layout ay naka-set sa **58 x 35 mm** na label, na may hanggang **48 mm** na lapad para sa barcode.
- Sa [Returned Items](frontend/src/gso/returnitems.tsx#L226), maaaring i-scan o ilagay ang barcode para hanapin ang item at kasalukuyang assigned na staff. Ipinapakita rin ang unit at kasalukuyang kondisyon.
- Sa confirmation ng return, pipili ang GSO ng kondisyon pagkatapos inspeksyunin ang item. Ang **Needs Repair**, **Under Maintenance**, at **Unserviceable** ay iruruta sa **To Be Repaired**. Ang **New**, **Good**, at **Fair** ay iruruta sa **GSO Storage**.
- Kapag nakumpleto na ang repair, maaari nang markahang repaired ang unit at ibalik ito sa GSO Storage.

## Mga kailangang idagdag o tandaan

- **Hindi nakakadetect ng sira ang barcode.** Kinukuha nito ang record ng item; GSO pa rin ang titingin sa kondisyon at magko-confirm ng return bago mangyari ang routing.
- **Aktuwal na petsa/oras ng pag-release:** Hindi pa ipinapakita sa scanned-item details ang eksaktong oras na pisikal na iniabot ang gamit. Para maipakita iyon nang tama, kailangang maitala ang release timestamp sa aktuwal na handoff at isama ito sa scan details/history.
- Ilagay sa sticker ang stable na unique tag code, hindi ang pangalan ng humiram o petsa ng issuance. Maaaring magbago ang assignment; dapat sa system manggaling ang kasalukuyang staff at issuance history kapag na-scan.

## Printer at scanner requirements

Ang mga larawang ipinakita ay listing para sa CLABEL 221B at NIIMBOT B1/B1 Pro thermal label printers. Hindi sapat ang listing images para matiyak na gagana ang eksaktong model sa browser print flow ng system.

Bago bumili, kumpirmahin sa seller na:

1. May Windows PC driver o ibang paraan para mag-print mula sa browser/system print dialog. Bluetooth o USB connection lang ay hindi garantiya na lalabas ang printer sa browser print dialog.
2. Kaya ng printer ang **58 x 35 mm adhesive thermal labels** o kaya ay tumatanggap ng custom label size na iyon. Puwedeng i-adjust ang layout kung ibang sukat ang suportado.
3. Kung app-only ang printer, kayang mag-import at mag-print ng label image/PDF mula sa system; kailangan pang idagdag o iangkop ang ganitong export flow kung iyon ang gagamiting paraan.

> Ang system ang nagre-render ng barcode sa label, kaya hindi kailangang i-encode ng printer ang staff o issuance data. Para sa handheld scanner, pumili ng model na nakakabasa ng **Code 128**; karaniwang mas simple ang USB scanner na gumagana bilang keyboard at nagpapadala ng Enter pagkatapos mag-scan.

## Mga kaugnay na bahagi ng code

- [Main Issuance label preview at printing](frontend/src/gso/mainissuance.tsx#L737)
- [Barcode lookup sa Returned Items](frontend/src/gso/returnitems.tsx#L226)
- [Return condition at destination](frontend/src/gso/returnitems.tsx#L745)
- [Repair completion](frontend/src/gso/torepaired.tsx#L242)
