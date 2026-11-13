import { Power } from "lucide-react";
import { workstationRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { useT } from "@/lib/i18n";
import type { Device } from "@/lib/types";
import { Modal } from "@/components/fulfillment/Modal";

/**
 * «Отключить» устройство — с объяснением, что это значит. Раньше кнопка
 * гасила устройство молча, а отказ сервера не показывался вовсе, и казалось,
 * что «ничего не происходит». Отключение необратимо для этого устройства:
 * вернуть его можно только новой привязкой за тем же компьютером.
 */
export function RevokeDevice({
  device,
  who,
  onClose,
}: {
  device: Device;
  /** Кто сейчас за устройством: его вход закончится вместе с ним. */
  who: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const revoke = useCommand(workstationRepository.revokeDevice);
  return (
    <Modal
      title={t("devices.revokeTitle", { name: device.name })}
      icon={<Power className="size-4 text-muted-foreground" />}
      submitLabel={t("devices.revoke")}
      pending={revoke.pending}
      error={revoke.error}
      onClose={onClose}
      onSubmit={async () => {
        const res = await revoke.run(device.id);
        if (res.ok) onClose();
      }}
    >
      <p className="text-sm">{t("devices.revokeBody")}</p>
      {who && <p className="text-sm font-medium">{t("devices.revokeWho", { name: who })}</p>}
      <p className="text-sm text-muted-foreground">{t("devices.revokeBack")}</p>
    </Modal>
  );
}
