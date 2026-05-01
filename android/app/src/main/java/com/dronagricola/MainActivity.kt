package com.dronagricola

import android.Manifest
import android.app.AlertDialog
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
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
        // URL de tu servidor en Render — ya está configurada
        private const val SERVER_URL = "https://dron-agricola-api-3.onrender.com"
    }

    private var btAdapter: BluetoothAdapter? = null
    private var btService: BluetoothService? = null
    private val ioScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private lateinit var btnConectar: Button
    private lateinit var btnDisparo:  Button
    private lateinit var tvEstado:    TextView

    private var disparoActivo = false
    // Buffer para acumular fragmentos del mensaje Bluetooth
    private var btBuffer = StringBuilder()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        btAdapter = (getSystemService(BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
        btnConectar = findViewById(R.id.btnConectar)
        btnDisparo  = findViewById(R.id.btnDisparo)
        tvEstado    = findViewById(R.id.tvEstado)

        if (btAdapter == null) {
            Toast.makeText(this, "Este dispositivo no soporta Bluetooth", Toast.LENGTH_LONG).show()
            finish(); return
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
                btnDisparo.setBackgroundColor(android.graphics.Color.parseColor("#00FF00"))
            } else {
                enviarBT("R_ON")
                disparoActivo = true
                btnDisparo.text = "DISPARO F\n● ACTIVO"
                btnDisparo.setBackgroundColor(android.graphics.Color.parseColor("#FFA500"))
            }
        }
    }

    // ─────────────────────────────────────────────────────────
    // BLUETOOTH
    // ─────────────────────────────────────────────────────────

    private fun pedirPermisosYConectar() {
        val necesita = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            arrayOf(Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN)
        else
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)

        val faltantes = necesita.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (faltantes.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, faltantes.toTypedArray(), REQUEST_PERMISOS)
            return
        }
        if (btAdapter?.isEnabled == false) {
            startActivityForResult(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), REQUEST_ENABLE_BT)
            return
        }
        mostrarDispositivosPareados()
    }

    private fun mostrarDispositivosPareados() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT)
            != PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this, "Permiso Bluetooth requerido", Toast.LENGTH_SHORT).show()
            return
        }
        val pareados = btAdapter?.bondedDevices?.toList() ?: emptyList()
        if (pareados.isEmpty()) {
            Toast.makeText(this, "Parea la ESP32 en Ajustes → Bluetooth primero.", Toast.LENGTH_LONG).show()
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
        btBuffer.clear()

        btService = BluetoothService(
            device         = device,
            onConnected    = {
                runOnUiThread {
                    setEstado("✓ Conectado a ${device.name}")
                    btnConectar.text      = "DESCONECTAR"
                    btnConectar.isEnabled = true
                    btnConectar.setBackgroundColor(android.graphics.Color.RED)
                }
            },
            onDisconnected = {
                runOnUiThread {
                    setEstado("Sin conexión")
                    btnConectar.text      = "CONECTAR BLUETOOTH"
                    btnConectar.isEnabled = true
                    btnConectar.setBackgroundColor(android.graphics.Color.BLUE)
                    disparoActivo  = false
                    btnDisparo.text = "DISPARO F"
                    btnDisparo.setBackgroundColor(android.graphics.Color.parseColor("#00FF00"))
                    btBuffer.clear()
                }
            },
            onDataReceived = { chunk ->
                // Acumular en buffer porque Bluetooth puede llegar fragmentado
                btBuffer.append(chunk)
                val contenido = btBuffer.toString()

                // Buscar líneas completas terminadas en \n
                val lineas = contenido.split("\n")
                // La última parte puede estar incompleta — la guardamos
                btBuffer.clear()
                btBuffer.append(lineas.last())

                // Procesar todas las líneas completas
                for (i in 0 until lineas.size - 1) {
                    val linea = lineas[i].trim()
                    if (linea.isEmpty()) continue
                    runOnUiThread { setEstado("ESP32: $linea") }
                    if (linea.startsWith("DATA:")) {
                        parsearYEnviarAlServidor(linea)
                    }
                }
            },
            onError = { msg ->
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
        btnConectar.setBackgroundColor(android.graphics.Color.BLUE)
        btBuffer.clear()
    }

    // ─────────────────────────────────────────────────────────
    // ENVÍO AL SERVIDOR
    // ─────────────────────────────────────────────────────────

    private fun parsearYEnviarAlServidor(raw: String) {
        try {
            // Formato exacto: DATA:1,0.5500,1.1000,9.7400,0.0550,0.1100,0.1650
            val valores = raw.removePrefix("DATA:").split(",")
            if (valores.size < 7) {
                runOnUiThread { setEstado("⚠ Formato incorrecto: $raw") }
                return
            }
            val json = JSONObject().apply {
                put("disparo",  valores[0].trim().toInt())
                put("accel_x",  valores[1].trim().toDouble())
                put("accel_y",  valores[2].trim().toDouble())
                put("accel_z",  valores[3].trim().toDouble())
                put("gyro_x",   valores[4].trim().toDouble())
                put("gyro_y",   valores[5].trim().toDouble())
                put("gyro_z",   valores[6].trim().toDouble())
            }
            enviarHttpPost(json.toString())
        } catch (e: Exception) {
            runOnUiThread { setEstado("⚠ Error parseando datos: ${e.message}") }
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
                conn.connectTimeout = 8_000
                conn.readTimeout    = 8_000
                conn.outputStream.use { os: OutputStream ->
                    os.write(jsonBody.toByteArray(StandardCharsets.UTF_8))
                }
                val code = conn.responseCode
                runOnUiThread {
                    if (code == 201)
                        setEstado("✓ Dato guardado en servidor")
                    else
                        setEstado("⚠ Servidor respondió: $code")
                }
                conn.disconnect()
            } catch (e: Exception) {
                runOnUiThread { setEstado("⚠ Sin red: dato NO guardado (${e.message})") }
            }
        }
    }

    private fun setEstado(msg: String) { tvEstado.text = msg }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<out String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_PERMISOS) {
            if (grantResults.all { it == PackageManager.PERMISSION_GRANTED })
                mostrarDispositivosPareados()
            else
                Toast.makeText(this, "Se necesitan permisos de Bluetooth.", Toast.LENGTH_LONG).show()
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