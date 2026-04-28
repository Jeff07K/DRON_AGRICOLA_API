package com.dronagricola

import android.Manifest
import android.app.AlertDialog
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

class MainActivity : AppCompatActivity() {

    companion object {
        private const val REQUEST_ENABLE_BT = 1
        private const val REQUEST_PERMISOS  = 2
        private const val SERVER_URL = "https://dron-agricola-api-3.onrender.com/"
    }

    private var btAdapter: BluetoothAdapter? = null
    private var btService: BluetoothService? = null
    private val ioScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private lateinit var btnConectar: Button
    private lateinit var btnDisparo:  Button
    private lateinit var tvEstado:    TextView

    private var disparoActivo    = false
    private var contadorDisparo  = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Obtener el adaptador BT de la forma no-deprecated
        btAdapter = (getSystemService(BLUETOOTH_SERVICE) as? android.bluetooth.BluetoothManager)
            ?.adapter

        btnConectar = findViewById(R.id.btnConectar)
        btnDisparo  = findViewById(R.id.btnDisparo)
        tvEstado    = findViewById(R.id.tvEstado)

        if (btAdapter == null) {
            Toast.makeText(this, "Este dispositivo no soporta Bluetooth", Toast.LENGTH_LONG).show()
            finish()
            return
        }

        btnConectar.setOnClickListener {
            if (btService?.isConnected == true) desconectar()
            else pedirPermisosYConectar()
        }

        findViewById<Button>(R.id.btnAdelante).setOnClickListener  { enviarBT("A") }
        findViewById<Button>(R.id.btnReversa).setOnClickListener   { enviarBT("B") }
        findViewById<Button>(R.id.btnIzquierda).setOnClickListener { enviarBT("C") }
        findViewById<Button>(R.id.btnDerecha).setOnClickListener   { enviarBT("D") }
        findViewById<Button>(R.id.btnFrenar).setOnClickListener    { enviarBT("E") }

        btnDisparo.setOnClickListener {
            if (disparoActivo) {
                enviarBT("R_OFF")
                disparoActivo = false
                btnDisparo.text = "DISPARO F"
            } else {
                contadorDisparo++
                enviarBT("R_ON")
                disparoActivo = true
                btnDisparo.text = "DISPARO F\n● ACTIVO"
            }
        }
    }

    private fun pedirPermisosYConectar() {
        val necesita = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN
            )
        } else {
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }

        val faltantes = necesita.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (faltantes.isNotEmpty()) {
            ActivityCompat.requestPermissions(
                this, faltantes.toTypedArray(), REQUEST_PERMISOS
            )
            return
        }

        if (btAdapter?.isEnabled == false) {
            val intent = Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)
            startActivityForResult(intent, REQUEST_ENABLE_BT)
            return
        }

        mostrarDispositivosPareados()
    }

    private fun mostrarDispositivosPareados() {
        // Verificar permiso antes de acceder a bondedDevices (Android 12+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT)
            != PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this, "Permiso Bluetooth no otorgado", Toast.LENGTH_SHORT).show()
            return
        }

        val pareados = btAdapter?.bondedDevices?.toList() ?: emptyList()

        if (pareados.isEmpty()) {
            Toast.makeText(
                this,
                "Parea la ESP32 en Ajustes → Bluetooth primero.",
                Toast.LENGTH_LONG
            ).show()
            return
        }

        val nombres = pareados.map { "${it.name}\n${it.address}" }.toTypedArray()

        AlertDialog.Builder(this)
            .setTitle("Selecciona tu ESP32")
            .setItems(nombres) { _, idx -> conectarA(pareados[idx]) }
            .show()
    }

    private fun conectarA(device: BluetoothDevice) {
        setEstado("Conectando a ${device.name}...")
        btnConectar.text      = "Conectando..."
        btnConectar.isEnabled = false

        btService = BluetoothService(
            device         = device,
            onConnected    = {
                runOnUiThread {
                    setEstado("✓ Conectado a ${device.name}")
                    btnConectar.text      = "DESCONECTAR"
                    btnConectar.isEnabled = true
                    // ← CORRECCIÓN: sin "id =" — es interop Java
                    btnConectar.backgroundTintList =
                        ContextCompat.getColorStateList(this, android.R.color.holo_red_dark)
                }
            },
            onDisconnected = {
                runOnUiThread {
                    setEstado("Sin conexión")
                    btnConectar.text      = "CONECTAR BLUETOOTH"
                    btnConectar.isEnabled = true
                    btnConectar.backgroundTintList =
                        ContextCompat.getColorStateList(this, android.R.color.holo_blue_bright)
                    disparoActivo  = false
                    btnDisparo.text = "DISPARO F"
                }
            },
            onDataReceived = { data ->
                runOnUiThread { tvEstado.text = "ESP32: ${data.trim()}" }
                parsearYEnviarAlServidor(data.trim())
            },
            onError        = { msg ->
                runOnUiThread {
                    Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
                    setEstado("Error: $msg")
                    btnConectar.text      = "CONECTAR BLUETOOTH"
                    btnConectar.isEnabled = true
                }
            }
        )
        btService!!.connect()
    }

    private fun enviarBT(cmd: String) {
        if (btService?.isConnected != true) {
            Toast.makeText(this, "Primero conecta la ESP32", Toast.LENGTH_SHORT).show()
            return
        }
        btService!!.send(cmd)
    }

    private fun desconectar() {
        btService?.disconnect()
        setEstado("Sin conexión")
        btnConectar.text = "CONECTAR BLUETOOTH"
        btnConectar.backgroundTintList =
            ContextCompat.getColorStateList(this, android.R.color.holo_blue_bright)
    }

    // ── Envío al servidor (silencioso si no hay internet) ────────────────────
    private fun parsearYEnviarAlServidor(raw: String) {
        if (!raw.startsWith("DATA:")) return
        try {
            val partes = raw.removePrefix("DATA:").split(",")
            if (partes.size < 6) return
            val json = JSONObject().apply {
                put("disparo", contadorDisparo)
                put("accel_x", partes[0].trim().toDouble())
                put("accel_y", partes[1].trim().toDouble())
                put("accel_z", partes[2].trim().toDouble())
                put("gyro_x",  partes[3].trim().toDouble())
                put("gyro_y",  partes[4].trim().toDouble())
                put("gyro_z",  partes[5].trim().toDouble())
            }
            enviarHttpPost(json.toString())
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun enviarHttpPost(jsonBody: String) {
        ioScope.launch {
            try {
                val conn = URL("$SERVER_URL/api/sensor-data")
                    .openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                conn.doOutput       = true
                conn.connectTimeout = 5_000
                conn.readTimeout    = 5_000
                conn.outputStream.use { os: OutputStream ->
                    os.write(jsonBody.toByteArray(StandardCharsets.UTF_8))
                }
                if (conn.responseCode == 201) {
                    runOnUiThread { tvEstado.append(" ✓") }
                }
                conn.disconnect()
            } catch (_: Exception) { /* Sin servidor → el dron sigue funcionando */ }
        }
    }

    private fun setEstado(msg: String) { tvEstado.text = msg }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_PERMISOS) {
            if (grantResults.all { it == PackageManager.PERMISSION_GRANTED })
                mostrarDispositivosPareados()
            else
                Toast.makeText(
                    this, "Se necesitan permisos de Bluetooth.", Toast.LENGTH_LONG
                ).show()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_ENABLE_BT && resultCode == RESULT_OK)
            mostrarDispositivosPareados()
    }

    override fun onDestroy() {
        super.onDestroy()
        btService?.disconnect()
        ioScope.cancel()
    }
}