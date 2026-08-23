import { useState } from 'react';

import { Button, ErrorNote, Sheet, Stepper } from '@/components/ui';
import { toApiError } from '@/lib/api';
import { useUpdateWater } from '@/services/water.service';
import type { WaterLog } from '@/types';
import { timeWIB } from '@/utils/date';

interface WaterEditSheetProps {
  log: WaterLog;
  onClose: () => void;
}

export const WaterEditSheet = ({ log, onClose }: WaterEditSheetProps) => {
  const update = useUpdateWater();

  const [jumlah, setJumlah] = useState(log.amount_ml);
  const [error, setError] = useState<string | null>(null);

  const simpan = () => {
    if (jumlah < 1) {
      setError('Jumlah air minimal 1 ml');
      return;
    }

    setError(null);

    update.mutate(
      { id: log.id, amount_ml: jumlah },
      { onSuccess: onClose, onError: (e) => setError(toApiError(e).message) },
    );
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={'Tegukan ' + timeWIB(log.logged_at)}
      footer={
        <Button label="Simpan perubahan" onPress={simpan} loading={update.isPending} size="lg" />
      }
    >
      <Stepper value={jumlah} onChange={setJumlah} step={50} min={1} max={5000} suffix="ml" />

      {error ? <ErrorNote message={error} /> : null}
    </Sheet>
  );
};
