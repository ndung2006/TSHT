-- Goi C 2026-11-07: Tin noi bat (noi-bat) maxSlots 4 -> 10 (user chot).
-- defaultMaxSlots('noi-bat') trong home-slot-rules.ts da doi thanh 10,
-- nhung dong live da ton tai tu seed 2026-11-05 (max_slots=4) khong tu
-- doi: ensureList() chi dung defaultMaxSlots khi tao dong MOI. Nang
-- dong live len 10 o day; neu dong chua ton tai thi ensureList() se
-- tao moi voi default 10. Khong dong den tieu-diem (giu 3).
-- Luu y: neu quan tri da tu sua max_slots cua noi-bat qua CMS (UI cho
-- toi da 20), migration nay van dua ve 10 theo quyet dinh cua user;
-- sau do van doi lai duoc qua man hinh sap xep (zones:publish).
UPDATE "home_slot_lists" SET "max_slots" = 10 WHERE "block_key" = 'noi-bat';
