package com.dronagricola

import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import kotlinx.coroutines.*
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID

class BluetoothService(
    private val device: BluetoothDevice,
    private val onConnected: () -> Unit,
    private val onDisconnected: () -> Unit,
    private val onDataReceived: (String) -> Unit,
    private val onError: (String) -> Unit
) {
    companion object {
        private val UUID_SPP: UUID =
            UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    }

    private var socket: BluetoothSocket? = null
    private var outputStream: OutputStream? = null
    private var inputStream: InputStream? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    var isConnected = false
        private set

    fun connect() {
        scope.launch {
            try {
                socket = device.createRfcommSocketToServiceRecord(UUID_SPP)
                socket!!.connect()
                outputStream = socket!!.outputStream
                inputStream  = socket!!.inputStream
                isConnected  = true
                onConnected()
                readLoop()
            } catch (e: IOException) {
                isConnected = false
                onError("No se pudo conectar: ${e.message}")
            }
        }
    }

    private suspend fun readLoop() {
        val buffer = ByteArray(1024)
        while (isConnected) {
            try {
                val bytes = inputStream!!.read(buffer)
                if (bytes > 0) {
                    onDataReceived(String(buffer, 0, bytes))
                }
            } catch (e: IOException) {
                if (isConnected) {
                    isConnected = false
                    onDisconnected()
                }
                break
            }
        }
    }

    fun send(command: String) {
        if (!isConnected) return
        scope.launch {
            try {
                outputStream?.write("$command\n".toByteArray())
                outputStream?.flush()
            } catch (e: IOException) {
                onError("Error al enviar: ${e.message}")
            }
        }
    }

    fun disconnect() {
        isConnected = false
        scope.cancel()
        try { socket?.close() } catch (_: IOException) {}
    }
}