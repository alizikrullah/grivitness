import { WarningIcon } from '@phosphor-icons/react';

import { colors } from '@/constants/colors';
import { Button } from './Button';
import { Modal } from './Modal';
import './ConfirmDialog.css';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** Teks tombol yang meneruskan tindakan. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Tindakannya merusak, jadi tombolnya merah dan ikon peringatan ikut tampil. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Dialog konfirmasi bertema aplikasi, pengganti confirm() bawaan browser.
 *
 * confirm() menggambar dialog milik browser: putih terang, tipografi sistem,
 * dan judul yang menyebutkan alamat situs. Di aplikasi bertema segelap ini ia
 * terasa datang dari tempat lain, dan justru muncul pada momen paling penting,
 * saat user memutuskan menghapus sesuatu yang tidak bisa dikembalikan.
 *
 * Dibangun di atas Modal yang sudah ada, jadi fokus terkunci, Escape menutup,
 * dan pembaca layar tetap mengumumkannya sebagai dialog.
 */
export const ConfirmDialog = ({
  open,
  title,
  message,
  confirmLabel = 'Hapus',
  cancelLabel = 'Batal',
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => (
  <Modal
    open={open}
    title={title}
    onClose={onCancel}
    footer={
      <div className="konfirmasi-tombol">
        <Button label={cancelLabel} variant="secondary" size="md" full onClick={onCancel} />
        <Button
          label={confirmLabel}
          variant={destructive ? 'danger' : 'primary'}
          size="md"
          full
          onClick={onConfirm}
        />
      </div>
    }
  >
    <div className="konfirmasi-isi">
      {destructive ? (
        <span className="konfirmasi-ikon">
          <WarningIcon size={22} color={colors.danger} weight="duotone" />
        </span>
      ) : null}

      <span className="t-body c-secondary">{message}</span>
    </div>
  </Modal>
);
