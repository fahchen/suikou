defmodule Suikou.Secrets do
  @moduledoc """
  The generated credentials of an install, persisted in the data directory
  (mode 0600) so they survive every restart and every upgrade.

  The bun launcher used to generate these before the server booted and pass
  them as environment variables. The server now owns them: `config/runtime.exs`
  reads each one here, generating it on first boot. A regenerated VAPID keypair
  would silently orphan every stored push subscription, so it is never rotated
  — delete `vapid.json` deliberately and accept the loss.
  """

  alias Suikou.DataDir

  @doc """
  The `SECRET_KEY_BASE` of the install: 64 random bytes, hex-encoded (128
  chars — Phoenix demands at least 64 bytes).
  """
  @spec secret_key_base() :: String.t()
  def secret_key_base do
    ensure_hex("secret_key_base", 64)
  end

  @doc """
  The Web Push VAPID keypair of the install, base64url-encoded as the
  `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` the release reads: the public key is
  the raw uncompressed P-256 point (65 bytes), the private key the 32-byte
  scalar — the exact encoding `WebPushElixir` url-decodes back into the EC key.
  """
  @spec vapid() :: %{public_key: String.t(), private_key: String.t()}
  def vapid do
    path = Path.join(DataDir.path(), "vapid.json")

    with {:ok, raw} <- File.read(path),
         {:ok, %{"public" => public, "private" => private}} when public != "" and private != "" <-
           Jason.decode(raw) do
      %{public_key: public, private_key: private}
    else
      _missing_or_corrupt ->
        # ECDSA over P-256: the public key comes out as the 65-byte
        # uncompressed point and the private key as the 32-byte scalar.
        {public, private} = :crypto.generate_key(:ecdh, :crypto.ec_curve(:secp256r1))

        pair = %{
          public_key: Base.url_encode64(public, padding: false),
          private_key: Base.url_encode64(private, padding: false)
        }

        write_private!(path, Jason.encode!(%{public: pair.public_key, private: pair.private_key}))
        pair
    end
  end

  defp ensure_hex(name, bytes) do
    path = Path.join(DataDir.path(), name)

    with {:ok, existing} <- File.read(path),
         secret when byte_size(secret) > 0 <- String.trim(existing) do
      secret
    else
      _missing_or_empty ->
        secret = Base.encode16(:crypto.strong_rand_bytes(bytes), case: :lower)
        write_private!(path, secret)
        secret
    end
  end

  # Writes with mode 0600 so a credential is never exposed in a
  # default-permissions window; the directory is the operator's own.
  defp write_private!(path, content) do
    File.mkdir_p!(Path.dirname(path))
    File.write!(path, content)
    File.chmod!(path, 0o600)
  end
end
