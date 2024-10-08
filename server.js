const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');

// Cargar variables de entorno
dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Leer variables del archivo .env
const calendarId = process.env.GOOGLE_CALENDAR_ID;
const sheetId = process.env.GOOGLE_SHEET_ID;
const googleCredentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

// Configuración de las credenciales del cliente de Google
const auth = new google.auth.GoogleAuth({
    credentials: googleCredentials,
    scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/spreadsheets',
    ],
});

// Inicializamos el cliente de Google Calendar y Google Sheets
const calendar = google.calendar({ version: 'v3', auth });
const sheets = google.sheets({ version: 'v4', auth });

// Intervals que debes validar en el calendario
const timeIntervals = {
    1: { start: '07:00', end: '10:00' },
    2: { start: '10:00', end: '13:00' },
    3: { start: '14:00', end: '17:00' },
    4: { start: '18:30', end: '21:30' },
};

// Convertir el objeto a un arreglo para facilitar la iteración
const timeIntervalsArray = Object.keys(timeIntervals).map(key => ({
    id: Number(key),
    ...timeIntervals[key],
}));

// Función para convertir intervalos a un formato compatible con Calendar
function convertToISODate(date, time) {
    // Agregar zona horaria manualmente (Bogotá está en UTC-5)
    return new Date(`${date}T${time}:00-05:00`).toISOString();
}


app.post('/validate-intervals', async (req, res) => {
    try {
        const { selectedDate } = req.body;

        // Convertir la fecha seleccionada al inicio y fin del día en la zona horaria de Bogotá (UTC-5)
        const startOfDay = new Date(`${selectedDate}T00:00:00-05:00`).toISOString();
        const endOfDay = new Date(`${selectedDate}T23:59:59-05:00`).toISOString();

        // Buscar eventos del día en el calendario
        const events = await calendar.events.list({
            calendarId,
            timeMin: startOfDay,
            timeMax: endOfDay,
            singleEvents: true,
            orderBy: 'startTime',
        });

        const occupiedIntervals = [];

        // Revisar los eventos para encontrar intervalos ocupados
        events.data.items.forEach((event) => {
            const eventStart = new Date(event.start.dateTime);
            const eventEnd = new Date(event.end.dateTime);

            // Verificar superposición con cada intervalo
            Object.values(timeIntervals).forEach((interval) => {
                // Crear objetos Date para los intervalos del día seleccionado (en UTC-5)
                const intervalStart = new Date(`${selectedDate}T${interval.start}:00-05:00`);
                const intervalEnd = new Date(`${selectedDate}T${interval.end}:00-05:00`);

                // Verificar superposición (eventStart < intervalEnd && eventEnd > intervalStart)
                if (
                    eventStart < intervalEnd && eventEnd > intervalStart
                ) {
                    occupiedIntervals.push(interval);
                }
            });
        });

        // Eliminar duplicados en occupiedIntervals
        const uniqueOccupiedIntervals = [...new Set(occupiedIntervals.map(JSON.stringify))].map(JSON.parse);

        // Filtrar los intervalos disponibles y añadir ID
        const availableIntervals = Object.entries(timeIntervals).filter(([id, interval]) => {
            const intervalStart = new Date(`${selectedDate}T${interval.start}:00-05:00`);
            const intervalEnd = new Date(`${selectedDate}T${interval.end}:00-05:00`);

            return !uniqueOccupiedIntervals.some(occupied => 
                intervalStart.getTime() === new Date(`${selectedDate}T${occupied.start}:00-05:00`).getTime() &&
                intervalEnd.getTime() === new Date(`${selectedDate}T${occupied.end}:00-05:00`).getTime()
            );
        }).map(([id, interval]) => ({ id, ...interval })); // Añadir ID a cada intervalo

        res.status(200).json({ availableIntervals });
    } catch (error) {
        console.error('Error al validar intervalos:', error);
        res.status(500).json({ error: 'Error al validar intervalos.' });
    }
});




// Endpoint para registrar un evento en el calendario y en la hoja de cálculo
app.post('/register-reservation', async (req, res) => {
    try {
        // Extraer currentDatetime junto con los demás campos del body
        const { currentDatetime, teacherName, program, subject, reservationDate, timeSlotId, observations } = req.body;

        // Obtener el intervalo de tiempo basado en el ID
        const selectedInterval = timeIntervals[timeSlotId];

        if (!selectedInterval) {
            return res.status(400).json({ error: 'Intervalo de tiempo no válido.' });
        }

        // Crear el evento en Google Calendar (sin cambios aquí)
        const event = {
            summary: `${teacherName} - ${subject} (${program})`,
            start: {
                dateTime: convertToISODate(reservationDate, selectedInterval.start),
                timeZone: 'America/Bogota',
            },
            end: {
                dateTime: convertToISODate(reservationDate, selectedInterval.end),
                timeZone: 'America/Bogota',
            },
        };

        await calendar.events.insert({
            calendarId,
            resource: event,
        });

        // Registrar los detalles en Google Sheets, incluyendo currentDatetime
        const rowData = [
            currentDatetime,       // Fecha y hora actuales (nuevo campo)
            teacherName,           // Nombre del profesor
            program,               // Programa
            subject,               // Asignatura
            reservationDate,        // Fecha de reserva
            `${selectedInterval.start} - ${selectedInterval.end}`, // Intervalo de tiempo
            observations         // Observaciones                
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: 'A1:G1',  // Asegúrate de que esta fila tenga espacio para el nuevo campo
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: {
                values: [rowData],
            },
        });

        res.status(200).json({ message: 'Reserva registrada correctamente.' });
    } catch (error) {
        console.error('Error al registrar la reserva:', error);
        res.status(500).json({ error: 'Error al registrar la reserva.' });
    }
});





// Inicializar el servidor en el puerto 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
