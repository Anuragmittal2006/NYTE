

         
        export    async function decryptMessage(encryptedMessage, iv, aesKey) {
                try {
                    // Decode Base64 IV, Encrypted Message, and AES Key
                    const ivBuffer = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
                    const encryptedMessageBuffer = Uint8Array.from(atob(encryptedMessage), (c) => c.charCodeAt(0));
                    const aesKeyBuffer = Uint8Array.from(atob(aesKey), (c) => c.charCodeAt(0));

                    // Import AES Key
                    const cryptoKey = await window.crypto.subtle.importKey(
                        "raw",
                        aesKeyBuffer.buffer,
                        { name: "AES-GCM" },
                        false,
                        ["decrypt"]
                    );

                    // Decrypt the Message
                    const decryptedData = await window.crypto.subtle.decrypt(
                        { name: "AES-GCM", iv: ivBuffer },
                        cryptoKey,
                        encryptedMessageBuffer.buffer
                    );

                    // Convert Decrypted Data to String and Return
                    return new TextDecoder().decode(decryptedData);
                } catch (error) {
                    console.error("Error in decryptMessage:", error);
                    throw error;
                }
            }
         