# Enteral formula reference

Checked on 2026-10-06. Scope: Nutrilon products for the Russian market. Values below refer to 100 mL of prepared formula at the manufacturer's standard dilution. They are not per 100 g powder or per 100 mL water. Energy is taken directly from the manufacturer's declared value, not reconstructed from rounded macronutrients.

| Product | kcal | Protein g | Carbohydrate g | Fat g | Source |
| --- | ---: | ---: | ---: | ---: | --- |
| Nutrilon Pre 0 | 79 | 2.6 | 8.3 | 3.8 | Nutricia professional brochure, final page |
| Nutrilon Pre 1 | 74 | 2.0 | 7.4 | 3.9 | Same brochure, final page |
| Nutrilon Pepti Gastro | 66 | 1.8 equivalent | 7.0 | 3.4 | Current Nutricia Medical product page |
| Nutrilon HA 1 | 65 | 1.5 | 7.2 | 3.4 | Nutrition images on current Nutriclub product page |

## Evidence

- Pre 0 / Pre 1 composition: https://static.nutricia-medical.ru/iblock/9d4/9d40dde961bab9e4aac91fc4bd7a07af.pdf (page 6; document itself bears an older revision date; current product pages do not expose a composition download).
- Pre 0 product and preparation (90 mL water + 3 scoops, 5.5 g/scoop): https://www.nutriclub.ru/nutrilon-pre-0-400/
- Pre 1 product and preparation (90 mL water + 3 scoops, 5 g/scoop): https://www.nutriclub.ru/nutrilon-pre-1-400/
- Pepti Gastro current composition: https://nutricia-medical.ru/catalog/short-bowel-syndrome/nutrilon-pepti-gastro/
- Pepti Gastro preparation (90 mL water + 3 scoops, 4.3 g/scoop): https://www.nutriclub.ru/nutrilon-pepti-gastro-450/
- HA 1 product and preparation (90 mL water + 3 scoops, 4.6 g/scoop): https://www.nutriclub.ru/nutrilon-ga-1-400/
- HA 1 nutrition image, macronutrients: https://nutriclub.ru/wp-content/uploads/2023/09/Nutrilon-HA-1-nutritional-value-1-724x1024.png
- HA 1 nutrition image, energy: https://nutriclub.ru/wp-content/uploads/2023/09/Nutrilon-HA-1-nutritional-value-2-1024x202.png

## Source discrepancy

HA 1's nutrition image on the current manufacturer page explicitly states **65 kcal / 100 mL** (475 kcal / 100 g powder). The older assortment PDF https://static.nutricia-medical.ru/iblock/58a/58a156cd66fc57ff1e59d2ad6c20bbd3.pdf states **67 kcal / 100 mL**. This application deliberately uses 65 and explains the discrepancy beside HA 1. It does not claim that every marketed batch has the same composition. Match the actual container before clinical use; a different label or dilution is outside this preset's scope.

Older instructions for Pepti Gastro list 3.5 g fat and 6.8 g carbohydrate. The current product page states 3.4 and 7.0; these current values are used.

## Calculation contract

Daily volume = entered mL/day, or mL/feed × feeds/day, or mL/kg/day × weight in kg. Nutrient/day = daily volume / 100 × label value. Nutrient/kg/day = volume per kg / 100 × label value. Intermediate numbers are not rounded. Zero volume gives zero nutrients; positive volume without a selected product gives unknown nutrients, not zero. Invalid input and overflow are reported. The enteral calculation is independent of incomplete PN fields. Its volume replaces the previous enteral volume in the fluid balance exactly once. The user enters a total daily protein goal; required IV amino acids are automatically reduced by known enteral protein and other IV protein, with a zero floor. Amino-acid volume and rate, the remaining base volume, and total energy are recalculated from that remainder. Enteral volume is not automatically reduced when its protein reaches or exceeds the goal. Unknown positive-volume enteral composition blocks the protein plan and complete fluid calculation. The selected fat and base-glucose targets are not automatically reduced by enteral intake.

This reference calculates intake, not an individual prescription, absorption, or adequacy. Mixed feeds, human milk, fortifiers and nonstandard dilution are not included. HA 1 is partially hydrolysed; Pepti Gastro is extensively hydrolysed. They are not interchangeable based solely on protein or calorie density.
