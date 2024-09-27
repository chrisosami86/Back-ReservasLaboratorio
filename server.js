// Importar Express y otros módulos necesarios
const express = require('express');
const app = express();
const cors = require('cors');
const { google } = require('googleapis');
const bodyParser = require('body-parser');

// Inicializamos Express
app.use(bodyParser.json());
app.use(cors());

// Crear una ruta de prueba para ver si el servidor funciona
app.get('/', (req, res) => {
    res.send('Servidor funcionando correctamente');
});

// Establecer el puerto donde el servidor escuchará
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});

// Configurar autenticación con Google (para Sheets y Calendar)
const auth = new google.auth.GoogleAuth({
    keyFile: 'reservaslaboratorio.json', // Asegúrate de que el archivo esté en la raíz del proyecto
    scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events' // Agregar el permiso para Google Calendar
    ],
});

// Inicializar el cliente de Google Sheets y Calendar
const sheets = google.sheets({ version: 'v4', auth });
const calendar = google.calendar({ version: 'v3', auth });

const SPREADSHEET_ID = '11GFwIMADh2cDQhtYBQibNa_iUNy-DhvhfWFBFKiBzMU'; // Reemplaza con tu ID de la hoja
const CALENDAR_ID = 'c_e6dee9761b6ad32a6f2be320180ffd8e6d32d52acd75a2246e5c52a7f681347b@group.calendar.google.com'; // Reemplaza con el ID de tu calendario

// Función para guardar en Google Sheets
async function guardarEnSheet(datos) {
    const response = await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Reservas!A1', // Ajusta esto según la hoja de cálculo (Reservas)
        valueInputOption: 'RAW',
        resource: {
            values: [
                [datos.docente, datos.programa, datos.materia, datos.dia, datos.horario, datos.horas]
            ],
        },
    });
    console.log('Datos guardados en la hoja de cálculo:', response.data);
}

// Función para calcular la hora de fin del evento
function calcularHoraFin(horarioInicio, horas) {
    const [horasInicio, minutosInicio] = horarioInicio.split(':').map(Number);
    const totalHoras = horasInicio + parseInt(horas, 10);
    return `${totalHoras.toString().padStart(2, '0')}:${minutosInicio.toString().padStart(2, '0')}:00`;
}

// Función para redondear la hora a los 15 minutos más cercanos
function redondearHora(horario) {
    const [horas, minutos] = horario.split(':').map(Number);
    const minutosRedondeados = Math.round(minutos / 15) * 15;

    const nuevasHoras = minutosRedondeados === 60 ? horas + 1 : horas;
    const nuevosMinutos = minutosRedondeados === 60 ? 0 : minutosRedondeados;

    return `${nuevasHoras.toString().padStart(2, '0')}:${nuevosMinutos.toString().padStart(2, '0')}:00`;
}

// Verificar disponibilidad en Google Sheets
async function verificarDisponibilidadEnSheet(dia, horario, horas) {
    try {
        const range = `Reservas!D2:F`; // Asegúrate de que este rango es correcto
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
        });

        const rows = response.data.values;
        if (rows && rows.length > 0) {
            const horariosOcupados = rows.map(row => ({
                dia: row[0], // Día en la columna D
                inicio: row[1], // Hora inicio en la columna E
                fin: row[2], // Hora fin en la columna F
            }));

            const horaInicioReserva = new Date(`${dia}T${horario}:00`);
            const horaFinReserva = new Date(horaInicioReserva);
            horaFinReserva.setHours(horaFinReserva.getHours() + parseInt(horas));

            for (const horarioOcupado of horariosOcupados) {
                const horaInicioOcupada = new Date(`${horarioOcupado.dia}T${horarioOcupado.inicio}:00`);
                const horaFinOcupada = new Date(`${horarioOcupado.dia}T${horarioOcupado.fin}:00`);

                // Comprobar si se solapan
                if ((horaInicioReserva >= horaInicioOcupada && horaInicioReserva < horaFinOcupada) ||
                    (horaFinReserva > horaInicioOcupada && horaFinReserva <= horaFinOcupada)) {
                    return false; // Hay un solapamiento, por lo tanto no está disponible
                }
            }
        }
        return true; // No hay solapamiento, por lo tanto está disponible
    } catch (error) {
        console.error('Error al verificar disponibilidad en Google Sheets:', error.message);
        throw new Error('Error verificando disponibilidad en Google Sheets');
    }
}

// Registrar la reserva en Google Sheets
async function registrarReservaEnSheet(docente, programa, materia, dia, horario, horas) {
    try {
        const values = [
            [docente, programa, materia, dia, horario, calcularHoraFin(horario, horas)]
        ];

        const request = {
            spreadsheetId: SPREADSHEET_ID,
            range: 'Reservas!A:F', // Ajusta el rango si es necesario
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: values,
            },
        };
        const response = await sheets.spreadsheets.values.append(request);
        console.log('Reserva registrada con éxito en Google Sheets:', response.status);
    } catch (error) {
        console.error('Error al registrar la reserva en Google Sheets:', error.message);
        throw new Error('Error guardando la reserva en Google Sheets');
    }
}

// Función para crear eventos en Google Calendar
async function crearEventoEnCalendar(datos) {
    const horarioRedondeado = redondearHora(datos.horario);

    const event = {
        summary: `Reserva: ${datos.docente} - ${datos.materia}`,
        description: `Programa: ${datos.programa}\nMateria: ${datos.materia}\nDocente: ${datos.docente}`,
        start: {
            dateTime: `${datos.dia}T${horarioRedondeado}`,
            timeZone: 'America/Bogota',
        },
        end: {
            dateTime: `${datos.dia}T${calcularHoraFin(horarioRedondeado, datos.horas)}`,
            timeZone: 'America/Bogota',
        },
    };

    try {
        const response = await calendar.events.insert({
            calendarId: CALENDAR_ID,
            resource: event,
        });
        console.log('Evento creado en Google Calendar:', response.data.htmlLink);
    } catch (error) {
        console.error('Error al crear evento en Google Calendar:', error.message);
        throw new Error('Error creando el evento en Google Calendar');
    }
}

// Ruta para manejar las reservas con validación
app.post('/reservar', async (req, res) => {
    const { docente, programa, materia, dia, horario, horas } = req.body;

    console.log('Datos recibidos:', { docente, programa, materia, dia, horario, horas });

    try {
        const disponible = await verificarDisponibilidadEnSheet(dia, horario, horas);

        if (!disponible) {
            return res.status(400).json({ message: 'El horario ya está reservado, por favor elige otro.' });
        }

        await registrarReservaEnSheet(docente, programa, materia, dia, horario, horas);
        await crearEventoEnCalendar({ docente, programa, materia, dia, horario, horas });

        res.status(200).json({ message: 'Reserva guardada correctamente en Google Sheets y Google Calendar' });
    } catch (error) {
        console.error('Error al guardar la reserva:', error);
        res.status(500).json({ message: 'Error al guardar la reserva' });
    }
});







