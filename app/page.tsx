// app/page.tsx

import ClientOnly from '@/components/ClientOnly';
import WalletConnectButton from '@/components/WalletConnectButton';
import { SarosDmmComponent } from '@/lib/dmm-actions'; // Import our new self-contained component

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-24 bg-black text-gray-200">
      <div className="absolute top-4 right-4">
        <ClientOnly>
          <WalletConnectButton />
        </ClientOnly>
      </div>

      <div className="text-center">
        <h1 className="text-4xl font-bold">Saros DLMM Toolkit</h1>
        <p className="mt-4">Connect your wallet to get started.</p>
      </div>
      <ClientOnly>
          <SarosDmmComponent />
      </ClientOnly>

    </main>
  );
}